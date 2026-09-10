import type { KanaGraduationKind } from "@/lib/types";

const WATCH_KEY_PREFIX = "vici_kana_graduation_watch";

// Scoped per user, same reasoning as session.ts's sessionKey -- a stale watch from a previous
// account in the same tab must never leak into a different user's /study/summary visit.
function watchKey(userId: string, kind: KanaGraduationKind): string {
  return `${WATCH_KEY_PREFIX}:${kind}:${userId}`;
}

/** Marks that a study session started with `kind`'s milestone not yet reached -- set once at
 * session start (see useStudyQueue's hiragana/katakanaMasteredRef mount effects and its
 * study_track baseline effect) so /study/summary knows to re-check for it if the live
 * celebration (useStudyQueue's checkKanaGraduation) never got the chance to show. That happens
 * whenever the qualifying review is the LAST card of the session: the queue-empty effect ends
 * the session and navigates away before checkKanaGraduation's async mastery check resolves, and
 * StudyPage's own skeleton gate (status === "ending") means the modal couldn't have rendered
 * there even if it had resolved in time. */
export function markKanaGraduationWatch(userId: string, kind: KanaGraduationKind) {
  if (typeof window !== "undefined") sessionStorage.setItem(watchKey(userId, kind), "1");
}

/** Clears the watch -- called both when the baseline check finds the milestone already reached
 * (nothing to watch for this session) and when the live celebration successfully shows (nothing
 * left for the /study/summary fallback to catch). */
export function clearKanaGraduationWatch(userId: string, kind: KanaGraduationKind) {
  if (typeof window !== "undefined") sessionStorage.removeItem(watchKey(userId, kind));
}

export function isKanaGraduationWatched(userId: string, kind: KanaGraduationKind): boolean {
  if (typeof window === "undefined") return false;
  return sessionStorage.getItem(watchKey(userId, kind)) === "1";
}
