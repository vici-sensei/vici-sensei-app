const SESSION_KEY_PREFIX = "vici_study_session_id";

// Scoped per user (not just one fixed key) so a stale session id from a previous account in the
// same tab -- e.g. after deleting an account and logging into a new one without closing the tab
// -- can never be read back for the new user. An unscoped id could point at a study_sessions row
// that no longer exists (cascade-deleted with the old user), which submit_review/introduce_*
// would then reject with a session_id foreign key violation.
function sessionKey(userId: string): string {
  return `${SESSION_KEY_PREFIX}:${userId}`;
}

export function getStoredSessionId(userId: string): number | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(sessionKey(userId));
  return raw ? Number(raw) : null;
}

export function setStoredSessionId(userId: string, id: number) {
  if (typeof window !== "undefined") sessionStorage.setItem(sessionKey(userId), String(id));
}

export function clearStoredSessionId(userId: string) {
  if (typeof window !== "undefined") sessionStorage.removeItem(sessionKey(userId));
}
