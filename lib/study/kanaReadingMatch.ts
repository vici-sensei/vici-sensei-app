import { levenshteinAlign } from "./diff";
import type { ReadingCheckResult } from "./kanjiReadingMatch";
import type { DueCard, KanaExtendedRomaji } from "@/lib/types";

/** Drops everything but letters -- spaces and punctuation (commas, periods, parentheses,
 * apostrophes, ...) are typing noise, not part of the reading, so a student skipping the space in
 * "hyuu hyuu" (the reduplicated-onomatopoeia romaji) or wrapping their answer in parentheses
 * shouldn't be marked wrong for it. */
function stripToLetters(value: string): string {
  return value.replace(/[^\p{L}]/gu, "");
}

/** The extended_romaji spellings for the hiragana/katakana row a reading card was built from, or
 * [] if that row has none (or `extended` hasn't loaded / the card isn't a kana reading card). */
export function extraRomajiForCard(
  card: Pick<DueCard, "exercise_type" | "hiragana_id" | "katakana_id">,
  extended: KanaExtendedRomaji | null,
): string[] {
  if (!extended) return [];
  if (card.exercise_type === "hiragana_reading" && card.hiragana_id != null) {
    return extended.hiragana[card.hiragana_id] ?? [];
  }
  if (card.exercise_type === "katakana_reading" && card.katakana_id != null) {
    return extended.katakana[card.katakana_id] ?? [];
  }
  return [];
}

/**
 * Kana reading cards test one canonical romaji string per character (`targetRomaji`), plus --
 * only when the student has turned on "Extended romaji" in Settings -- any number of extra
 * accepted spellings (`extraRomaji`, the row's extended_romaji). No homograph siblings, no
 * furigana, unlike checkKanjiReadingAnswer's word-level matching. A straight case-insensitive
 * compare against every accepted spelling (with a typo diff on mismatch, reusing the same diff
 * utility) is all that's needed -- spaces/punctuation are stripped from both sides first (see
 * stripToLetters) so the diff itself never flags one as a mismatch, and that also means values
 * like "n'" or "o-" from extended_romaji compare as their letters-only form ("n", "o").
 *
 * `extra` is either a list of extra spellings (a kana card's extended_romaji) or a predicate over
 * the normalized input (a whole word checked by matchesExtendedRomaji, which spells the word out
 * of its kana instead of listing every combination).
 *
 * The extras only widen what counts as correct -- on a wrong answer the diff is always drawn
 * against the canonical `targetRomaji` alone, never against an extra spelling, so what the student
 * is shown as "the" correct reading is the same with Extended romaji on or off.
 */
export function checkKanaReadingAnswer(
  input: string,
  targetRomaji: string,
  extra: readonly string[] | ((normalizedInput: string) => boolean) = [],
): ReadingCheckResult {
  const display = stripToLetters(input);
  const compare = display.toLowerCase();
  const targetDisplay = stripToLetters(targetRomaji);
  const targetCompare = targetDisplay.toLowerCase();

  const acceptedByExtra =
    typeof extra === "function" ? extra(compare) : extra.some((spelling) => stripToLetters(spelling).toLowerCase() === compare);
  if (compare === targetCompare || acceptedByExtra) {
    return { correct: true, userDiff: [], targetDiff: [] };
  }

  const { userDiff, targetDiff } = levenshteinAlign(compare, display, targetCompare, targetDisplay);
  return { correct: false, userDiff, targetDiff };
}
