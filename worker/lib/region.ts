/**
 * Deliberately NOT imported from lib/supabase/regions.ts -- that module reaches for `window`
 * (localStorage) and browser env-var inlining, neither of which exist in the Workers runtime,
 * the same reason supabase/functions/ (Deno) is kept separate from the Next.js app's code. Keep
 * `REGIONS`/`Region` here in sync with lib/supabase/regions.ts by hand; there's no build step
 * that would catch the two drifting apart.
 */
export const REGIONS = ["eu", "us"] as const;
export type Region = (typeof REGIONS)[number];
export const DEFAULT_REGION: Region = "eu";

export function isRegion(value: string | null | undefined): value is Region {
  return value === "eu" || value === "us";
}

export function otherRegion(region: Region): Region {
  return region === "eu" ? "us" : "eu";
}

/**
 * Cloudflare's 2-letter `request.cf.continent` codes -- see
 * https://developers.cloudflare.com/workers/runtime-apis/request/#incomingrequestcfproperties.
 * Mirrors Decision 1's continent map (Europe/Africa/Asia/Oceania -> eu, North/South America ->
 * us) as used by `regionForContinent()` in lib/supabase/regions.ts, which is keyed on the DB's
 * full continent names instead -- same map, different alphabet, because this runs at the edge
 * before any Supabase row exists to read a continent from.
 */
const CF_CONTINENT_REGION: Record<string, Region> = {
  EU: "eu",
  AF: "eu",
  AS: "eu",
  OC: "eu",
  NA: "us",
  SA: "us",
};

export function regionFromCfContinent(continent: unknown): Region {
  return (typeof continent === "string" && CF_CONTINENT_REGION[continent]) || DEFAULT_REGION;
}

/** Case-insensitive account key -- Google/Gmail addresses are effectively case-insensitive, and
 * `auth.users.email` preserves whatever case Google's OAuth response happened to send. */
export function emailKey(email: string): string {
  return email.trim().toLowerCase();
}
