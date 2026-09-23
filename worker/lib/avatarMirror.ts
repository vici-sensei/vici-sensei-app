import { type Env, projectConfig } from "./env";
import { pgSelectAll, pgUpdateWhere, type PostgrestConfig } from "./postgrest";
import { REGIONS, type Region } from "./region";

/**
 * Copies Google profile photos -- the avatar_url handle_new_user() gives every Google signup --
 * into the user's own project's `avatars` bucket, then points users.avatar_url at the copy.
 *
 * Hotlinked lh3.googleusercontent.com URLs get throttled by Google (HTTP 429, seen live in a
 * browser rendering the leaderboard's avatars all at once), so those avatars loaded late or fell
 * back to the placeholder icon. Google resizes and re-encodes on request ("=s512-c-rw" is a 512px
 * square WebP), so this only moves bytes: the same "avatar-<timestamp>.webp" + "_sm" thumbnail
 * pair, with the same one-year cache, that the app's own uploadAvatar() writes.
 *
 * Stays put afterwards: on a later Google login, handle_user_metadata_change() only fills
 * users.avatar_url when it's null. If the user changes their photo while a copy is in flight, the
 * guarded update below matches nothing and the unused copy is left to avatar_gc's nightly sweep.
 */

// Five subrequests per user (2 Google fetches, 2 uploads, 1 update) -- a small batch keeps a run
// well under the Worker's per-invocation subrequest cap; the hourly cron picks up the rest.
const USERS_PER_REGION_PER_RUN = 4;
const THUMB_SIZE = 128; // lib/avatar.ts AVATAR_THUMB_SIZE
const FULL_SIZE = 512; // AvatarEditor's AVATAR_TARGET_SIZE
const CACHE_CONTROL = "max-age=31536000";

async function uploadAvatarObject(cfg: PostgrestConfig, path: string, body: Response): Promise<boolean> {
  const res = await fetch(new URL(`storage/v1/object/avatars/${path}`, cfg.url), {
    method: "POST",
    headers: {
      apikey: cfg.serviceRoleKey,
      Authorization: `Bearer ${cfg.serviceRoleKey}`,
      "Content-Type": "image/webp",
      "cache-control": CACHE_CONTROL,
    },
    body: await body.arrayBuffer(),
  });
  return res.ok;
}

async function mirrorOne(cfg: PostgrestConfig, userId: string, googleUrl: string): Promise<string | null> {
  const base = googleUrl.split("=")[0];
  const [full, thumb] = await Promise.all([fetch(`${base}=s${FULL_SIZE}-c-rw`), fetch(`${base}=s${THUMB_SIZE}-c-rw`)]);
  if (!full.ok || !thumb.ok) return `google HTTP ${full.status}/${thumb.status}`;
  if (full.headers.get("content-type") !== "image/webp" || thumb.headers.get("content-type") !== "image/webp") {
    return "google did not return webp";
  }

  const stem = `${userId}/avatar-${Date.now()}`;
  const uploaded = await Promise.all([
    uploadAvatarObject(cfg, `${stem}.webp`, full),
    uploadAvatarObject(cfg, `${stem}_sm.webp`, thumb),
  ]);
  if (!uploaded.every(Boolean)) return "storage upload failed";

  await pgUpdateWhere(
    cfg,
    "users",
    { id: `eq.${userId}`, avatar_url: `eq.${googleUrl}` },
    { avatar_url: new URL(`storage/v1/object/public/avatars/${stem}.webp`, cfg.url).toString() }
  );
  return null;
}

export async function mirrorGoogleAvatars(env: Env): Promise<void> {
  const results: Array<{ region: Region; user_id: string; error: string | null }> = [];
  for (const region of REGIONS) {
    const { url, serviceRoleKey } = projectConfig(env, region);
    if (!serviceRoleKey) continue;
    const cfg = { url, serviceRoleKey };
    const candidates = await pgSelectAll<{ id: string; avatar_url: string }>(cfg, "users", {
      avatar_url: "like.*googleusercontent.com*",
      select: "id,avatar_url",
      limit: "200",
    });
    // A random pick rather than a fixed order, so a photo Google keeps refusing can't hold the
    // same slot every hour and starve everyone behind it.
    const users = candidates
      .map((user) => ({ user, sort: Math.random() }))
      .sort((a, b) => a.sort - b.sort)
      .slice(0, USERS_PER_REGION_PER_RUN)
      .map(({ user }) => user);
    for (const user of users) {
      let error: string | null;
      try {
        error = await mirrorOne(cfg, user.id, user.avatar_url);
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      }
      results.push({ region, user_id: user.id, error });
    }
  }

  // Logged only when there was something to do -- once everyone's copied, an hourly empty run
  // would otherwise flood the table.
  if (results.length > 0) {
    await env.ACCOUNTS_DB.prepare("INSERT INTO reconciliation_log (status, detail) VALUES (?1, ?2)")
      .bind(results.every((r) => r.error === null) ? "avatar_mirror_ok" : "avatar_mirror_errors", JSON.stringify(results))
      .run();
  }
}
