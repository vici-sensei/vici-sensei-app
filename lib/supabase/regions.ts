import { guessServerRegion } from "@/lib/serverRegion";

/**
 * Everything here is inert unless `NEXT_PUBLIC_MULTI_REGION` is `"true"` — see `isMultiRegionEnabled()`.
 * With the flag off (the default), `createClient()` in `./client.ts` never calls into this module.
 */

export const REGIONS = ["eu", "us"] as const;
export type Region = (typeof REGIONS)[number];

/** Where every current user is, and the fallback whenever a region can't be determined. */
export const DEFAULT_REGION: Region = "eu";

export function isMultiRegionEnabled(): boolean {
  return process.env.NEXT_PUBLIC_MULTI_REGION === "true";
}

/**
 * Empty in production -- `/api/*` is same-origin there (wrangler.jsonc's `run_worker_first`
 * routes it to this same Worker). `next dev` (:3000) has no `/api/*` of its own (`output:
 * "export"` forbids rewrites even in dev, see next.config.ts and next's static-exports doc), so
 * `.env.development.local` points this at the deployed Worker instead -- calls made while
 * developing locally act on the real live EU/US projects, same as production. The Worker only
 * echoes back a matching `Access-Control-Allow-Origin` for `http://localhost:3000` (see
 * worker/index.ts), so this has no effect unless that env var is set.
 */
export function workerOrigin(): string {
  return process.env.NEXT_PUBLIC_WORKER_ORIGIN ?? "";
}

interface RegionConfig {
  url: string;
  anonKey: string;
}

/**
 * Next.js only inlines `NEXT_PUBLIC_*` reads written as literal `process.env.NEXT_PUBLIC_X`
 * (see node_modules/next/dist/docs/01-app/02-guides/environment-variables.md, "Referencing Other
 * Variables" / "will NOT be inlined" section) — a computed key like `process.env["…_" + region]`
 * would just be `undefined` in the browser bundle. That's why this is a switch over each literal
 * var instead of a template built from `REGIONS`; adding a region means adding both a literal case
 * here and a literal pair of env vars, not just extending the `REGIONS` array.
 */
export function regionConfig(region: Region): RegionConfig {
  switch (region) {
    case "eu":
      return {
        url: process.env.NEXT_PUBLIC_SUPABASE_URL_EU!,
        anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_EU!,
      };
    case "us":
      return {
        url: process.env.NEXT_PUBLIC_SUPABASE_URL_US!,
        anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY_US!,
      };
  }
}

/**
 * Decision 1's continent→region map, keyed on the same strings as the `countries_continent_check`
 * constraint in the baseline migration (`public.countries.continent`, mirrored onto
 * `public.users.continent` by `sync_user_continent`). Not called from anywhere yet — Phase 3's
 * Worker needs its own version keyed on Cloudflare's 2-letter `cf.continent` codes (a different
 * runtime, not this module), and Phase 4/6 are what will actually call this one, against the DB
 * value, once a signed-in user's continent is known.
 */
const CONTINENT_REGION: Record<string, Region> = {
  Europe: "eu",
  Africa: "eu",
  Asia: "eu",
  Oceania: "eu",
  "North America": "us",
  "South America": "us",
};

export function regionForContinent(continent: string | null | undefined): Region {
  return (continent && CONTINENT_REGION[continent]) || DEFAULT_REGION;
}

const ACTIVE_REGION_STORAGE_KEY = "vici-active-region";

export function isRegion(value: unknown): value is Region {
  return typeof value === "string" && (REGIONS as readonly string[]).includes(value);
}

/** Best-effort guess, reusing the same timezone heuristic `serverRegion.ts` already has for the
 * (separate, decorative) onboarding/settings region picker — there's no signed-in user yet to
 * read a real continent from at this point. */
function guessActiveRegion(): Region {
  return guessServerRegion() === "America" ? "us" : "eu";
}

/**
 * The region `createClient()` currently talks to, persisted separately from any session token
 * (`AuthClient`'s own `storageKey` in `./client.ts` is derived per-project, so switching this
 * never collides with either region's session). Falls back to a timezone guess, not
 * `DEFAULT_REGION`, so a first-time US visitor with multi-region enabled doesn't get routed to
 * `eu` just because that's where today's 8 users happen to be.
 */
export function getActiveRegion(): Region {
  try {
    const stored = window.localStorage.getItem(ACTIVE_REGION_STORAGE_KEY);
    if (isRegion(stored)) return stored;
  } catch {
    // Ignore -- private browsing / storage disabled, fall through to the guess below.
  }
  return guessActiveRegion();
}

export function setActiveRegion(region: Region): void {
  try {
    window.localStorage.setItem(ACTIVE_REGION_STORAGE_KEY, region);
  } catch {
    // Ignore -- private browsing / storage disabled.
  }
}

/** True once a region has been explicitly persisted (a prior visit, a wrong_region retry, a
 * manual pick) rather than only guessed. The login page uses this to decide whether it's worth
 * refining the initial guess with the Worker's real geo-IP lookup (/api/geo) -- not worth doing
 * for a returning visitor who already has a settled region. */
export function hasStoredActiveRegion(): boolean {
  try {
    return isRegion(window.localStorage.getItem(ACTIVE_REGION_STORAGE_KEY));
  } catch {
    return false;
  }
}
