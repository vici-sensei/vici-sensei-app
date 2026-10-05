/** Where the one-time "hold a kanji to see its meaning" line (KanjiHint) was first acted on. The
 * two contexts keep separate flags: learning the gesture on a /study card doesn't tell anyone it
 * also works in the dictionary. Per user, since the line is about what that student has discovered
 * -- though it lives in this browser only. */
export type KanjiHintContext = "study" | "dictionary";

function storageKey(userId: string, context: KanjiHintContext): string {
  return `kanjiHintSeen:${context}:${userId}`;
}

export function hasSeenKanjiHint(userId: string, context: KanjiHintContext): boolean {
  if (typeof window === "undefined") return true;
  try {
    return window.localStorage.getItem(storageKey(userId, context)) !== null;
  } catch {
    // Private browsing / blocked storage: skip the line rather than nag on every card.
    return true;
  }
}

export function markKanjiHintSeen(userId: string, context: KanjiHintContext) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(storageKey(userId, context), "1");
  } catch {
    // ignore (private browsing / quota)
  }
}
