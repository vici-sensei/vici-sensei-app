const DRAFT_KEY_PREFIX = "vici_reading_test_draft";

// Scoped per user + test + sentence (same reasoning as lib/study/session.ts's sessionKey) so a
// stale draft from a previous account in the same browser is never read back for a different
// user, and so drafts for different tests/sentences never collide. localStorage (not
// sessionStorage) deliberately -- these are meant to survive closing the tab/browser entirely,
// not just a refresh.
function draftKey(userId: string, testType: string, sentenceId: number): string {
  return `${DRAFT_KEY_PREFIX}:${userId}:${testType}:${sentenceId}`;
}

export function readDraft(userId: string, testType: string, sentenceId: number): string {
  if (typeof window === "undefined") return "";
  return window.localStorage.getItem(draftKey(userId, testType, sentenceId)) ?? "";
}

export function writeDraft(userId: string, testType: string, sentenceId: number, value: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(draftKey(userId, testType, sentenceId), value);
}

export function clearDraft(userId: string, testType: string, sentenceId: number) {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(draftKey(userId, testType, sentenceId));
}
