import { levenshteinAlign } from "./diff";
import type { ReadingCheckResult } from "./kanjiReadingMatch";

/**
 * Kana reading cards test exactly one fixed short romaji string per character --
 * no homograph siblings, no furigana, unlike checkKanjiReadingAnswer's word-level
 * matching. A straight case-insensitive compare (with a typo diff on mismatch,
 * reusing the same diff utility) is all that's needed.
 */
export function checkKanaReadingAnswer(input: string, targetRomaji: string): ReadingCheckResult {
  const display = input.trim();
  const compare = display.toLowerCase();
  const targetCompare = targetRomaji.trim().toLowerCase();

  if (compare === targetCompare) {
    return { correct: true, userDiff: [], targetDiff: [] };
  }

  const { userDiff, targetDiff } = levenshteinAlign(compare, display, targetCompare, targetRomaji.trim());
  return { correct: false, userDiff, targetDiff };
}
