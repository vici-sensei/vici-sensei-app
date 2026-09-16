import { levenshteinAlign } from "./diff";
import type { ReadingCheckResult } from "./kanjiReadingMatch";

/** Drops everything but letters -- spaces and punctuation (commas, periods, parentheses,
 * apostrophes, ...) are typing noise, not part of the reading, so a student skipping the space in
 * "hyuu hyuu" (the reduplicated-onomatopoeia romaji) or wrapping their answer in parentheses
 * shouldn't be marked wrong for it. */
function stripToLetters(value: string): string {
  return value.replace(/[^\p{L}]/gu, "");
}

/**
 * Kana reading cards test exactly one fixed short romaji string per character --
 * no homograph siblings, no furigana, unlike checkKanjiReadingAnswer's word-level
 * matching. A straight case-insensitive compare (with a typo diff on mismatch,
 * reusing the same diff utility) is all that's needed -- spaces/punctuation are stripped from
 * both sides first (see stripToLetters) so the diff itself never flags one as a mismatch.
 */
export function checkKanaReadingAnswer(input: string, targetRomaji: string): ReadingCheckResult {
  const display = stripToLetters(input);
  const compare = display.toLowerCase();
  const targetDisplay = stripToLetters(targetRomaji);
  const targetCompare = targetDisplay.toLowerCase();

  if (compare === targetCompare) {
    return { correct: true, userDiff: [], targetDiff: [] };
  }

  const { userDiff, targetDiff } = levenshteinAlign(compare, display, targetCompare, targetDisplay);
  return { correct: false, userDiff, targetDiff };
}
