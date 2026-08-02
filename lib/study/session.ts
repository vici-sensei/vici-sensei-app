const SESSION_KEY = "vici_study_session_id";

export function getStoredSessionId(): number | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(SESSION_KEY);
  return raw ? Number(raw) : null;
}

export function setStoredSessionId(id: number) {
  if (typeof window !== "undefined") sessionStorage.setItem(SESSION_KEY, String(id));
}

export function clearStoredSessionId() {
  if (typeof window !== "undefined") sessionStorage.removeItem(SESSION_KEY);
}
