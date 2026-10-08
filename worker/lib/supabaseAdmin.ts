import { projectConfig, type Env } from "./env";
import type { PostgrestConfig } from "./postgrest";
import type { Region } from "./region";

/** `region`'s project URL and service_role key. Throws when the key isn't set, instead of letting
 * a request go out with a missing "Bearer" token and fail with an HTTP 401 that hides the cause. */
export function serviceConfig(env: Env, region: Region): PostgrestConfig {
  const { url, serviceRoleKey } = projectConfig(env, region);
  if (!serviceRoleKey) throw new Error(`missing service role key for ${region}`);
  return { url, serviceRoleKey };
}

/** The two headers every service_role request to Supabase (REST, Auth Admin API, Storage) carries. */
export function serviceAuthHeaders(serviceRoleKey: string): Record<string, string> {
  return { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` };
}

type AdminInit = Omit<RequestInit, "headers"> & { headers?: Record<string, string> };

/** A request to `region`'s project with the service_role key -- `path` is relative to the project
 * URL (e.g. "auth/v1/admin/users/<id>"). Bypasses RLS entirely, like everything else in this folder
 * that holds that key. */
export async function adminFetch(env: Env, region: Region, path: string, init: AdminInit = {}): Promise<Response> {
  const { url, serviceRoleKey } = serviceConfig(env, region);
  return fetch(new URL(path, url), { ...init, headers: { ...serviceAuthHeaders(serviceRoleKey), ...init.headers } });
}

/** Every user of `region`'s project, one page at a time (Auth Admin API, GET /auth/v1/admin/users).
 * Ends after the first page shorter than `perPage`; the caller stops reading whenever it has what it
 * came for. Throws on an HTTP error or an answer that isn't a list of users -- a caller that can
 * tolerate that (e.g. one that only wants to know "is this email taken?") catches it. */
export async function* adminUserPages<U>(
  env: Env,
  region: Region,
  { perPage = 1000, signal }: { perPage?: number; signal?: AbortSignal } = {}
): AsyncGenerator<U[]> {
  for (let page = 1; ; page += 1) {
    const res = await adminFetch(env, region, `auth/v1/admin/users?page=${page}&per_page=${perPage}`, { signal });
    if (!res.ok) throw new Error(`admin/users ${region} page ${page}: HTTP ${res.status}`);
    const body = (await res.json()) as { users?: U[] };
    if (!Array.isArray(body.users)) throw new Error(`admin/users ${region} page ${page}: no users list in the response`);
    yield body.users;
    if (body.users.length < perPage) return;
  }
}
