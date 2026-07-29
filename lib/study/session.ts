import type { StudySessionEnd } from "@/lib/types";

const SESSION_KEY = "vici_study_session_id";
const SUMMARY_KEY = "vici_study_summary";

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

export function setStoredSummary(summary: StudySessionEnd) {
  if (typeof window !== "undefined") sessionStorage.setItem(SUMMARY_KEY, JSON.stringify(summary));
}

/** Reads and clears the stored summary — a page refresh on /study/summary has no context, by design. */
export function popStoredSummary(): StudySessionEnd | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(SUMMARY_KEY);
  if (!raw) return null;
  sessionStorage.removeItem(SUMMARY_KEY);
  try {
    return JSON.parse(raw) as StudySessionEnd;
  } catch {
    return null;
  }
}
