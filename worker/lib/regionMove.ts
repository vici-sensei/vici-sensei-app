import type { Env } from "./env";
import { projectConfig } from "./env";
import { emailKey, isRegion, type Region } from "./region";
import { pgDeleteWhere, pgInsertMany, pgSelectAll, pgSelectOne, pgUpdateWhere, type PostgrestConfig } from "./postgrest";

/**
 * Self-service region move: copies a user's identity + all 18 per-user tables from their current
 * Supabase project to the other one, then retires the old account (30-day grace period, same
 * mechanism as delete-account -- see supabase/migrations/*_region_move_retirement.sql for the
 * `retired_to_region` column/guard this depends on).
 *
 * Driven entirely by `/continue`, called repeatedly by the client until `done: true`. Each call
 * does exactly ONE unit of work (create target user, sync profile, drain one table, avatar,
 * Stripe, update the D1 ledger, or retire the source) to stay well under Cloudflare's per-request
 * subrequest limit for a user with a large table -- see runNextStep() below. Every step is
 * idempotent so a crash/timeout mid-move is safe to resume from the next `/continue` call; nothing
 * branches on the display-only `status` column, only on which columns are still unset/zero.
 */

interface TableSpec {
  name: string;
  /** false for the 2 tables with a natural composite PK (no identity `id` column to strip). */
  hasIdentityId: boolean;
  /** true for the 8 tables with a `session_id` FK into study_sessions.id that must be remapped. */
  hasSessionId: boolean;
}

// study_sessions MUST be first (its id remap depends on nothing else; the 8 session_id tables
// depend on it having been fully drained already). Order among the rest doesn't matter.
const COPY_TABLES: TableSpec[] = [
  { name: "study_sessions", hasIdentityId: true, hasSessionId: false },
  { name: "leaderboard_daily_stats", hasIdentityId: false, hasSessionId: false },
  { name: "practice_logs", hasIdentityId: true, hasSessionId: false },
  { name: "review_logs", hasIdentityId: true, hasSessionId: true },
  { name: "test_status", hasIdentityId: true, hasSessionId: false },
  { name: "user_achievements", hasIdentityId: true, hasSessionId: false },
  { name: "user_hiragana_progress", hasIdentityId: true, hasSessionId: true },
  { name: "user_hiragana_rule_progress", hasIdentityId: true, hasSessionId: true },
  { name: "user_kanji_basics_progress", hasIdentityId: true, hasSessionId: true },
  { name: "user_kanji_meaning_progress", hasIdentityId: true, hasSessionId: true },
  { name: "user_kanji_reading_progress", hasIdentityId: true, hasSessionId: false },
  { name: "user_katakana_progress", hasIdentityId: true, hasSessionId: true },
  { name: "user_katakana_rule_progress", hasIdentityId: true, hasSessionId: true },
  { name: "user_reading_test_attempts", hasIdentityId: false, hasSessionId: false },
  { name: "user_reading_test_progress", hasIdentityId: true, hasSessionId: false },
  { name: "user_vocabulary_progress", hasIdentityId: true, hasSessionId: true },
];

interface RegionMoveRow {
  id: number;
  email_key: string;
  email: string;
  source_region: Region;
  target_region: Region;
  source_user_id: string;
  target_user_id: string | null;
  profile_synced: number;
  current_table: string | null;
  avatar_done: number;
  stripe_done: number;
  ledger_updated: number;
  source_retired: number;
  status: string;
  last_error: string | null;
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function restConfig(env: Env, region: Region): PostgrestConfig {
  const { url, serviceRoleKey } = projectConfig(env, region);
  if (!serviceRoleKey) throw new Error(`missing service role key for ${region}`);
  return { url, serviceRoleKey };
}

/** Verifies a user's access token against their claimed source project -- never trust a
 * client-supplied user id/email, always re-derive it from the token on every call (start,
 * continue, and status all do this; no move id crosses the wire). */
async function verifyAccessToken(env: Env, region: Region, token: string): Promise<{ id: string; email: string } | null> {
  const { url, anonKey } = projectConfig(env, region);
  const res = await fetch(new URL("auth/v1/user", url), {
    headers: { apikey: anonKey, Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { id?: string; email?: string };
  if (!body.id || !body.email) return null;
  return { id: body.id, email: body.email };
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("Authorization");
  if (!header?.startsWith("Bearer ")) return null;
  return header.slice("Bearer ".length);
}

// ---------------------------------------------------------------------------
// D1 access
// ---------------------------------------------------------------------------

async function findActiveMove(env: Env, key: string): Promise<RegionMoveRow | null> {
  const row = await env.ACCOUNTS_DB.prepare("SELECT * FROM region_moves WHERE email_key = ?1 AND status <> 'completed'")
    .bind(key)
    .first<RegionMoveRow>();
  return row ?? null;
}

async function createMove(
  env: Env,
  key: string,
  email: string,
  sourceRegion: Region,
  targetRegion: Region,
  sourceUserId: string
): Promise<RegionMoveRow> {
  const row = await env.ACCOUNTS_DB.prepare(
    `INSERT INTO region_moves (email_key, email, source_region, target_region, source_user_id, current_table, status)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'started')
     RETURNING *`
  )
    .bind(key, email, sourceRegion, targetRegion, sourceUserId, COPY_TABLES[0].name)
    .first<RegionMoveRow>();
  if (!row) throw new Error("failed to create region_moves row");
  return row;
}

async function patchMove(env: Env, id: number, patch: Record<string, string | number | null>): Promise<void> {
  const columns = Object.keys(patch);
  const setClause = columns.map((col, i) => `${col} = ?${i + 2}`).join(", ");
  await env.ACCOUNTS_DB.prepare(
    `UPDATE region_moves SET ${setClause}, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id = ?1`
  )
    .bind(id, ...columns.map((col) => patch[col]))
    .run();
}

async function logStep(env: Env, moveId: number, step: string, ok: boolean, detail?: string): Promise<void> {
  await env.ACCOUNTS_DB.prepare("INSERT INTO region_move_log (move_id, step, ok, detail) VALUES (?1, ?2, ?3, ?4)")
    .bind(moveId, step, ok ? 1 : 0, detail ?? null)
    .run();
}

// ---------------------------------------------------------------------------
// Admin API (auth.users) helpers
// ---------------------------------------------------------------------------

async function createTargetAuthUser(
  env: Env,
  targetRegion: Region,
  email: string,
  fullName: string | null,
  avatarUrl: string | null
): Promise<string> {
  const { url, serviceRoleKey } = projectConfig(env, targetRegion);
  const res = await fetch(new URL("auth/v1/admin/users", url), {
    method: "POST",
    headers: {
      apikey: serviceRoleKey!,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      email_confirm: true,
      user_metadata: { full_name: fullName, avatar_url: avatarUrl },
    }),
  });
  if (res.ok) {
    const body = (await res.json()) as { id: string };
    return body.id;
  }
  // Recovery path: a prior attempt may have created the user but crashed before the id was
  // persisted to D1. Look it up instead of failing outright.
  const existing = await findUserIdByEmail(env, targetRegion, email);
  if (existing) return existing;
  throw new Error(`createTargetAuthUser ${targetRegion}: HTTP ${res.status} ${await res.text()}`);
}

async function findUserIdByEmail(env: Env, region: Region, email: string): Promise<string | null> {
  const { url, serviceRoleKey } = projectConfig(env, region);
  let page = 1;
  const perPage = 1000;
  for (;;) {
    const endpoint = new URL("auth/v1/admin/users", url);
    endpoint.searchParams.set("page", String(page));
    endpoint.searchParams.set("per_page", String(perPage));
    const res = await fetch(endpoint, { headers: { apikey: serviceRoleKey!, Authorization: `Bearer ${serviceRoleKey}` } });
    if (!res.ok) throw new Error(`findUserIdByEmail ${region} page ${page}: HTTP ${res.status}`);
    const body = (await res.json()) as { users: Array<{ id: string; email?: string }> };
    const match = body.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (match) return match.id;
    if (body.users.length < perPage) return null;
    page += 1;
  }
}

// ---------------------------------------------------------------------------
// Step machine
// ---------------------------------------------------------------------------

async function stepCreateTargetUser(env: Env, row: RegionMoveRow): Promise<void> {
  const sourceCfg = restConfig(env, row.source_region);
  const profile = await pgSelectOne<{ display_name: string | null; avatar_url: string | null }>(sourceCfg, "users", {
    id: `eq.${row.source_user_id}`,
    select: "display_name,avatar_url",
  });
  const targetUserId = await createTargetAuthUser(
    env,
    row.target_region,
    row.email,
    profile?.display_name ?? null,
    profile?.avatar_url ?? null
  );
  await patchMove(env, row.id, { target_user_id: targetUserId, status: "target_created" });
}

async function stepSyncProfile(env: Env, row: RegionMoveRow): Promise<void> {
  const sourceCfg = restConfig(env, row.source_region);
  const targetCfg = restConfig(env, row.target_region);

  const sourceUser = await pgSelectOne<Record<string, unknown>>(sourceCfg, "users", { id: `eq.${row.source_user_id}` });
  if (sourceUser) {
    // is_premium/stripe_customer_id are handled together in stepStripe, not here -- keep the
    // "this account has an active subscription" state changing in one atomic-ish step, not split
    // across two.
    delete sourceUser.id;
    delete sourceUser.email;
    delete sourceUser.stripe_customer_id;
    delete sourceUser.is_premium;
    delete sourceUser.admin;
    delete sourceUser.pending_deletion_at;
    // The target row isn't always freshly created by the trigger -- stepCreateTargetUser's
    // recovery path can resolve `target_user_id` to a PRE-EXISTING auth.users row for this email
    // (a prior move back-and-forth left one retired there). Force-clear any stale retirement
    // state on it explicitly: without this, a target reused from an old retired account keeps
    // its old pending_deletion_at, which both RLS-blocks the user immediately (confirmed live --
    // the target account's own SELECT/UPDATE policies require pending_deletion_at IS NULL) and
    // would let process-scheduled-deletions delete the now-active account on the OLD schedule.
    sourceUser.pending_deletion_at = null;
    sourceUser.retired_to_region = null;
    await pgUpdateWhere(targetCfg, "users", { id: `eq.${row.target_user_id}` }, sourceUser);
  }

  const sourceStats = await pgSelectOne<Record<string, unknown>>(sourceCfg, "leaderboard_stats", {
    user_id: `eq.${row.source_user_id}`,
  });
  if (sourceStats) {
    delete sourceStats.user_id;
    await pgUpdateWhere(targetCfg, "leaderboard_stats", { user_id: `eq.${row.target_user_id}` }, sourceStats);
  }

  const sourceSettings = await pgSelectOne<Record<string, unknown>>(sourceCfg, "user_study_settings", {
    user_id: `eq.${row.source_user_id}`,
  });
  if (sourceSettings) {
    delete sourceSettings.user_id;
    await pgUpdateWhere(targetCfg, "user_study_settings", { user_id: `eq.${row.target_user_id}` }, sourceSettings);
  }

  await patchMove(env, row.id, { profile_synced: 1, status: "profile_synced" });
}

async function buildSessionIdMap(
  sourceCfg: PostgrestConfig,
  targetCfg: PostgrestConfig,
  sourceUserId: string,
  targetUserId: string
): Promise<Map<number, number>> {
  const [sourceSessions, targetSessions] = await Promise.all([
    pgSelectAll<{ id: number }>(sourceCfg, "study_sessions", { user_id: `eq.${sourceUserId}`, select: "id", order: "id.asc" }),
    pgSelectAll<{ id: number }>(targetCfg, "study_sessions", { user_id: `eq.${targetUserId}`, select: "id", order: "id.asc" }),
  ]);
  const map = new Map<number, number>();
  sourceSessions.forEach((row, i) => {
    const targetRow = targetSessions[i];
    if (targetRow) map.set(row.id, targetRow.id);
  });
  return map;
}

async function stepDrainTable(env: Env, row: RegionMoveRow, table: TableSpec): Promise<void> {
  const sourceCfg = restConfig(env, row.source_region);
  const targetCfg = restConfig(env, row.target_region);
  const targetUserId = row.target_user_id!;

  // Idempotent re-run: clear whatever this table already has for the target user before
  // re-inserting, so a repeated call after a partial failure never double-inserts.
  await pgDeleteWhere(targetCfg, table.name, { user_id: `eq.${targetUserId}` });

  const query: Record<string, string> = { user_id: `eq.${row.source_user_id}` };
  if (table.name === "study_sessions") query.order = "id.asc";
  const sourceRows = await pgSelectAll<Record<string, unknown>>(sourceCfg, table.name, query);

  const sessionIdMap = table.hasSessionId
    ? await buildSessionIdMap(sourceCfg, targetCfg, row.source_user_id, targetUserId)
    : null;

  const payloads = sourceRows.map((sourceRow) => {
    const payload: Record<string, unknown> = { ...sourceRow, user_id: targetUserId };
    if (table.hasIdentityId) delete payload.id;
    if (sessionIdMap) {
      const oldSessionId = payload.session_id as number | null;
      payload.session_id = oldSessionId == null ? null : sessionIdMap.get(oldSessionId) ?? null;
    }
    return payload;
  });
  await pgInsertMany(targetCfg, table.name, payloads);

  const idx = COPY_TABLES.findIndex((t) => t.name === table.name);
  const next = COPY_TABLES[idx + 1]?.name ?? null;
  await patchMove(env, row.id, { current_table: next, status: next ? `copied_${table.name}` : "data_copied" });
}

async function stepAvatar(env: Env, row: RegionMoveRow): Promise<void> {
  const sourceCfg = restConfig(env, row.source_region);
  const targetCfg = restConfig(env, row.target_region);
  const sourceUser = await pgSelectOne<{ avatar_url: string | null }>(sourceCfg, "users", {
    id: `eq.${row.source_user_id}`,
    select: "avatar_url",
  });
  const avatarUrl = sourceUser?.avatar_url ?? null;
  const sourceStoragePrefix = new URL("storage/v1/object/public/avatars/", sourceCfg.url).toString();

  if (avatarUrl && avatarUrl.startsWith(sourceStoragePrefix)) {
    const path = avatarUrl.slice(sourceStoragePrefix.length); // "<source_user_id>/<filename>"
    const filename = path.split("/").pop() ?? "avatar";
    const bytesRes = await fetch(avatarUrl);
    if (bytesRes.ok) {
      const bytes = await bytesRes.arrayBuffer();
      const contentType = bytesRes.headers.get("content-type") ?? "application/octet-stream";
      const uploadRes = await fetch(
        new URL(`storage/v1/object/avatars/${row.target_user_id}/${filename}`, targetCfg.url),
        {
          method: "POST",
          headers: {
            apikey: targetCfg.serviceRoleKey,
            Authorization: `Bearer ${targetCfg.serviceRoleKey}`,
            "Content-Type": contentType,
            "x-upsert": "true",
          },
          body: bytes,
        }
      );
      if (uploadRes.ok) {
        const newUrl = new URL(`storage/v1/object/public/avatars/${row.target_user_id}/${filename}`, targetCfg.url).toString();
        await pgUpdateWhere(targetCfg, "users", { id: `eq.${row.target_user_id}` }, { avatar_url: newUrl });
      }
      // A failed upload isn't fatal to the move -- the target row already has the original
      // (still-valid, cross-project) avatar_url from stepCreateTargetUser's user_metadata. Leave
      // it as-is and move on rather than blocking the whole move over a cosmetic asset.
    }
  }

  await patchMove(env, row.id, { avatar_done: 1, status: "avatar_done" });
}

async function stepStripe(env: Env, row: RegionMoveRow): Promise<void> {
  const sourceCfg = restConfig(env, row.source_region);
  const targetCfg = restConfig(env, row.target_region);
  const sourceUser = await pgSelectOne<{ stripe_customer_id: string | null; is_premium: boolean }>(sourceCfg, "users", {
    id: `eq.${row.source_user_id}`,
    select: "stripe_customer_id,is_premium",
  });
  if (sourceUser?.stripe_customer_id) {
    await pgUpdateWhere(
      targetCfg,
      "users",
      { id: `eq.${row.target_user_id}` },
      { stripe_customer_id: sourceUser.stripe_customer_id, is_premium: sourceUser.is_premium }
    );
    // Cleared on the source strictly BEFORE the source is ever marked pending_deletion_at (see
    // stepRetireSource) -- otherwise process-scheduled-deletions would cancel/delete the Stripe
    // customer the target row now also references.
    await pgUpdateWhere(sourceCfg, "users", { id: `eq.${row.source_user_id}` }, { stripe_customer_id: null });
  }
  await patchMove(env, row.id, { stripe_done: 1, status: "stripe_done" });
}

async function stepUpdateLedger(env: Env, row: RegionMoveRow): Promise<void> {
  await env.ACCOUNTS_DB.prepare("UPDATE accounts SET region = ?1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE email_key = ?2")
    .bind(row.target_region, row.email_key)
    .run();
  await patchMove(env, row.id, { ledger_updated: 1, status: "ledger_updated" });
}

async function stepRetireSource(env: Env, row: RegionMoveRow): Promise<void> {
  const sourceCfg = restConfig(env, row.source_region);
  const pendingDeletionAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await pgUpdateWhere(
    sourceCfg,
    "users",
    { id: `eq.${row.source_user_id}` },
    { pending_deletion_at: pendingDeletionAt, retired_to_region: row.target_region }
  );
  await patchMove(env, row.id, { source_retired: 1, status: "completed" });
}

/** Issues a magic-link token for the target project so the frontend can call
 * `supabase.auth.verifyOtp({ email, token_hash, type: "magiclink" })` against a target-region
 * client and land the user in an established session immediately, instead of sending them back
 * through a manual "Continue with Google" click -- and, more importantly, without depending on
 * whether the target project's "Automatic Linking" Auth setting would even let a subsequent
 * Google sign-in attach to the admin-API-created auth.users row at all (unverified from code;
 * this sidesteps the question entirely rather than resting the whole re-auth flow on it).
 * NEEDS LIVE VERIFICATION: confirm `hashed_token`/`properties.hashed_token` is the field this
 * GoTrue version actually returns before shipping -- see the plan's verification section. */
async function generateMagicLinkTokenHash(env: Env, region: Region, email: string): Promise<string | null> {
  const { url, serviceRoleKey } = projectConfig(env, region);
  const res = await fetch(new URL("auth/v1/admin/generate_link", url), {
    method: "POST",
    headers: {
      apikey: serviceRoleKey!,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ type: "magiclink", email }),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { properties?: { hashed_token?: string }; hashed_token?: string };
  return body.properties?.hashed_token ?? body.hashed_token ?? null;
}

interface StepResult {
  done: boolean;
  status: string;
  targetRegion?: Region;
  email?: string;
  signInTokenHash?: string | null;
}

/** Runs exactly one step and returns whether the whole move is now complete. Never trust
 * `row.status` for branching -- only for display; the individual columns are the resume state. */
async function runNextStep(env: Env, row: RegionMoveRow): Promise<StepResult> {
  const step = !row.target_user_id
    ? "create_target_user"
    : !row.profile_synced
      ? "sync_profile"
      : row.current_table
        ? `drain_${row.current_table}`
        : !row.avatar_done
          ? "avatar"
          : !row.stripe_done
            ? "stripe"
            : !row.ledger_updated
              ? "update_ledger"
              : !row.source_retired
                ? "retire_source"
                : "done";

  if (step === "done") {
    // Called again after completion (e.g. the client missed the first completion response) --
    // issue a fresh token rather than failing, generate_link has no meaningful "already done"
    // state of its own to be idempotent against.
    const signInTokenHash = await generateMagicLinkTokenHash(env, row.target_region, row.email);
    return { done: true, status: "completed", targetRegion: row.target_region, email: row.email, signInTokenHash };
  }

  try {
    if (step === "create_target_user") await stepCreateTargetUser(env, row);
    else if (step === "sync_profile") await stepSyncProfile(env, row);
    else if (step.startsWith("drain_")) {
      const table = COPY_TABLES.find((t) => t.name === row.current_table);
      if (!table) throw new Error(`unknown table checkpoint: ${row.current_table}`);
      await stepDrainTable(env, row, table);
    } else if (step === "avatar") await stepAvatar(env, row);
    else if (step === "stripe") await stepStripe(env, row);
    else if (step === "update_ledger") await stepUpdateLedger(env, row);
    else if (step === "retire_source") await stepRetireSource(env, row);
    await logStep(env, row.id, step, true);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await logStep(env, row.id, step, false, message);
    await patchMove(env, row.id, { last_error: message });
    throw err;
  }

  if (step === "retire_source") {
    const signInTokenHash = await generateMagicLinkTokenHash(env, row.target_region, row.email);
    return { done: true, status: "completed", targetRegion: row.target_region, email: row.email, signInTokenHash };
  }
  return { done: false, status: step };
}

// ---------------------------------------------------------------------------
// HTTP handlers
// ---------------------------------------------------------------------------

async function resolveIdentity(
  request: Request,
  env: Env,
  sourceRegion: string | null
): Promise<{ email: string; id: string; region: Region } | Response> {
  if (!sourceRegion || !isRegion(sourceRegion)) {
    return json({ error: "missing_or_invalid_sourceRegion" }, 400);
  }
  const token = bearerToken(request);
  if (!token) return json({ error: "missing_bearer_token" }, 401);
  const identity = await verifyAccessToken(env, sourceRegion, token);
  if (!identity) return json({ error: "invalid_token" }, 401);
  return { ...identity, region: sourceRegion };
}

export async function handleRegionMoveStart(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const targetRegionRaw = typeof body.targetRegion === "string" ? body.targetRegion : null;
  const sourceRegionRaw = typeof body.sourceRegion === "string" ? body.sourceRegion : null;

  const identity = await resolveIdentity(request, env, sourceRegionRaw);
  if (identity instanceof Response) return identity;
  const { email, id: sourceUserId, region: sourceRegion } = identity;

  if (!targetRegionRaw || !isRegion(targetRegionRaw) || targetRegionRaw === sourceRegion) {
    return json({ error: "invalid_target_region" }, 400);
  }
  const targetRegion = targetRegionRaw;

  const sourceCfg = restConfig(env, sourceRegion);
  const profile = await pgSelectOne<{ admin: boolean; pending_deletion_at: string | null }>(sourceCfg, "users", {
    id: `eq.${sourceUserId}`,
    select: "admin,pending_deletion_at",
  });
  if (profile?.admin) return json({ error: "admin_accounts_cannot_move" }, 403);
  if (profile?.pending_deletion_at) return json({ error: "account_pending_deletion" }, 409);

  const key = emailKey(email);
  const ledgerRow = await env.ACCOUNTS_DB.prepare("SELECT region FROM accounts WHERE email_key = ?1").bind(key).first<{
    region: Region;
  }>();
  if (ledgerRow && ledgerRow.region !== sourceRegion) {
    return json({ error: "region_mismatch", actualRegion: ledgerRow.region }, 409);
  }

  const existing = await findActiveMove(env, key);
  if (existing) {
    if (existing.target_region !== targetRegion) {
      return json({ error: "move_in_progress_different_target", targetRegion: existing.target_region }, 409);
    }
    return json({ status: existing.status, targetRegion: existing.target_region });
  }

  const created = await createMove(env, key, email, sourceRegion, targetRegion, sourceUserId);
  await logStep(env, created.id, "started", true);
  return json({ status: created.status, targetRegion });
}

export async function handleRegionMoveContinue(request: Request, env: Env): Promise<Response> {
  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const sourceRegionRaw = typeof body.sourceRegion === "string" ? body.sourceRegion : null;

  const identity = await resolveIdentity(request, env, sourceRegionRaw);
  if (identity instanceof Response) return identity;
  const { email } = identity;

  const key = emailKey(email);
  const row = await findActiveMove(env, key);
  if (!row) return json({ error: "no_active_move" }, 404);

  try {
    const result = await runNextStep(env, row);
    return json(result);
  } catch (err) {
    return json({ done: false, error: err instanceof Error ? err.message : String(err) }, 500);
  }
}

export async function handleRegionMoveStatus(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const identity = await resolveIdentity(request, env, url.searchParams.get("sourceRegion"));
  if (identity instanceof Response) return identity;

  const key = emailKey(identity.email);
  const row = await findActiveMove(env, key);
  if (!row) return json({ active: false });
  return json({ active: true, status: row.status, sourceRegion: row.source_region, targetRegion: row.target_region });
}
