/**
 * "Pick a server region" step -- there's no actual multi-region infrastructure
 * behind this yet, so the choice has no real effect. It's saved anyway
 * (`user_study_settings.preferred_server_region`) so it survives a refresh,
 * and preselected/ordered from the browser's timezone until the user picks,
 * like `guessCountryFromTimezone()` does for the country step.
 */
export const SERVER_REGIONS = ["America", "Europe"] as const;
export type ServerRegion = (typeof SERVER_REGIONS)[number];

/** Best-effort guess of the closer of the two available regions, from the browser/OS timezone. */
export function guessServerRegion(): ServerRegion {
  try {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return timeZone.startsWith("America/") || timeZone === "Pacific/Honolulu" ? "America" : "Europe";
  } catch {
    return "Europe";
  }
}

/** Puts the recommended region first, so the picker lists it before the alternative. */
export function orderedServerRegions(recommended: ServerRegion): ServerRegion[] {
  return [recommended, ...SERVER_REGIONS.filter((r) => r !== recommended)];
}
