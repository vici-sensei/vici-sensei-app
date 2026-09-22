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

function isRegion(value: string | null): value is Region {
  return (REGIONS as readonly string[]).includes(value ?? "");
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
