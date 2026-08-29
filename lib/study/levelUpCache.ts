const MAX_LEVEL_KEY_PREFIX = "vici_n1_mastery_celebrated";

// check_and_advance_jlpt_level has nothing further to advance to once N1 is fully learned, so
// (unlike every lower level, where moving on to the next level naturally stops the check from
// re-firing) it keeps reporting isMaxLevel on every single kanji/vocab review from then on. There's
// no server-side record of "already celebrated" (deliberately -- see the migration's header
// comment), so this is tracked client-side instead: persistent (localStorage, not sessionStorage)
// since the point is never showing the modal again on this device, not just this tab session.
function maxLevelKey(userId: string): string {
  return `${MAX_LEVEL_KEY_PREFIX}:${userId}`;
}

export function hasCelebratedMaxLevel(userId: string): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(maxLevelKey(userId)) === "1";
}

export function markMaxLevelCelebrated(userId: string) {
  if (typeof window !== "undefined") localStorage.setItem(maxLevelKey(userId), "1");
}
