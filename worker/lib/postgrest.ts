/** Thin PostgREST client for cross-project reads/writes with the service_role key -- bypasses RLS
 * entirely, same trust level as the Admin API calls `listAllUserEmails`/`runReconciliation` already
 * make in index.ts. Used by regionMove.ts to copy a user's rows from one Supabase project's schema
 * to the other's; nothing here is Region-move-specific, it's generic enough to reuse elsewhere. */

export interface PostgrestConfig {
  url: string;
  serviceRoleKey: string;
}

const PAGE_SIZE = 500;

function restHeaders(cfg: PostgrestConfig, extra?: Record<string, string>): Record<string, string> {
  return {
    apikey: cfg.serviceRoleKey,
    Authorization: `Bearer ${cfg.serviceRoleKey}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

function restUrl(cfg: PostgrestConfig, table: string, query?: Record<string, string>): URL {
  const url = new URL(`rest/v1/${table}`, cfg.url);
  if (query) for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
  return url;
}

async function throwIfNotOk(res: Response, label: string): Promise<void> {
  if (!res.ok) throw new Error(`${label}: HTTP ${res.status} ${await res.text()}`);
}

/** Pages through every row matching `query` (e.g. `{ user_id: "eq.<id>" }`), 500 at a time.
 * Callers that need a stable cross-project row order (the study_sessions id remap) must pass an
 * explicit `order` in `query` -- this function never assumes one. */
export async function pgSelectAll<T = Record<string, unknown>>(
  cfg: PostgrestConfig,
  table: string,
  query: Record<string, string>
): Promise<T[]> {
  const results: T[] = [];
  let from = 0;
  for (;;) {
    const res = await fetch(restUrl(cfg, table, query), {
      headers: restHeaders(cfg, { Range: `${from}-${from + PAGE_SIZE - 1}`, "Range-Unit": "items" }),
    });
    await throwIfNotOk(res, `pgSelectAll ${table}`);
    const page = (await res.json()) as T[];
    results.push(...page);
    if (page.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return results;
}

export async function pgSelectOne<T = Record<string, unknown>>(
  cfg: PostgrestConfig,
  table: string,
  query: Record<string, string>
): Promise<T | null> {
  const res = await fetch(restUrl(cfg, table, { ...query, limit: "1" }), { headers: restHeaders(cfg) });
  await throwIfNotOk(res, `pgSelectOne ${table}`);
  const rows = (await res.json()) as T[];
  return rows[0] ?? null;
}

/** Inserts in chunks of 500. Each row object controls its own columns -- callers drop an identity
 * `id` column before calling this if the target should assign a fresh one. */
export async function pgInsertMany(cfg: PostgrestConfig, table: string, rows: Record<string, unknown>[]): Promise<void> {
  if (rows.length === 0) return;
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const res = await fetch(restUrl(cfg, table), {
      method: "POST",
      headers: restHeaders(cfg, { Prefer: "return=minimal" }),
      body: JSON.stringify(chunk),
    });
    await throwIfNotOk(res, `pgInsertMany ${table}`);
  }
}

export async function pgUpdateWhere(
  cfg: PostgrestConfig,
  table: string,
  query: Record<string, string>,
  patch: Record<string, unknown>
): Promise<void> {
  const res = await fetch(restUrl(cfg, table, query), {
    method: "PATCH",
    headers: restHeaders(cfg, { Prefer: "return=minimal" }),
    body: JSON.stringify(patch),
  });
  await throwIfNotOk(res, `pgUpdateWhere ${table}`);
}

export async function pgDeleteWhere(cfg: PostgrestConfig, table: string, query: Record<string, string>): Promise<void> {
  const res = await fetch(restUrl(cfg, table, query), {
    method: "DELETE",
    headers: restHeaders(cfg, { Prefer: "return=minimal" }),
  });
  await throwIfNotOk(res, `pgDeleteWhere ${table}`);
}
