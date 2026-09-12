const STARTED_KEY_PREFIX = "vici_reading_test_started";

// Scoped per user + test (same reasoning as lib/study/session.ts's sessionKey) so a stale flag
// from a previous account in the same tab is never read back for a different user, and so
// hiragana/katakana don't share state. sessionStorage (not localStorage) deliberately -- pressing
// Start should only be remembered for as long as this tab stays open, so a refresh mid-pass
// doesn't re-show the intro, but closing the tab and coming back later does. Resuming mid-pass
// from a DIFFERENT device/tab is instead covered by the DB: ReadingTestPage treats any existing
// user_reading_test_progress row (any device, any earlier session) as "already started" too, same
// as reading_test_cta_state's "not_started" only ever meaning zero rows answered.
function startedKey(userId: string, testType: string): string {
  return `${STARTED_KEY_PREFIX}:${userId}:${testType}`;
}

export function getReadingTestStarted(userId: string, testType: string): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(startedKey(userId, testType)) === "1";
}

export function markReadingTestStarted(userId: string, testType: string) {
  if (typeof window !== "undefined") sessionStorage.setItem(startedKey(userId, testType), "1");
}
