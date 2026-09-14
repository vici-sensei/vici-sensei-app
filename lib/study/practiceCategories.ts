import type { StudyTrack } from "@/lib/types";

/** The 4 groups /study/practice's category picker offers -- "kanji" covers both kanji_meaning
 * and kanji_reading cards mixed together (see getPracticeDeck), the other 3 map one-to-one onto
 * a single practice pool kind. */
export type PracticeCategory = "hiragana" | "katakana" | "kanji" | "vocabulary";

export const ALL_PRACTICE_CATEGORIES: readonly PracticeCategory[] = ["hiragana", "katakana", "kanji", "vocabulary"];

export const PRACTICE_CATEGORY_LABEL: Record<PracticeCategory, string> = {
  hiragana: "Hiragana",
  katakana: "Katakana",
  kanji: "Kanji",
  vocabulary: "Vocabulary",
};

/** Kanji/vocabulary aren't studied yet on the kana track -- there's nothing there for a user to
 * practice, so the picker doesn't offer them at all (matches the dashboard's own gating of
 * anything kanji/vocab-shaped while on this track). */
export function availablePracticeCategories(track: StudyTrack): readonly PracticeCategory[] {
  return track === "standard" ? ALL_PRACTICE_CATEGORIES : (["hiragana", "katakana"] as const);
}
