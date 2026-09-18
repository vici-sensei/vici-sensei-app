import { levenshteinAlign, levenshteinDistance, type DiffChar } from "./diff";

export interface ReadingCheckResult {
  correct: boolean;
  userDiff: DiffChar[];
  targetDiff: DiffChar[];
}

export type ReadingCheckOutcome =
  | { kind: "target"; result: ReadingCheckResult }
  | { kind: "alternate"; display: string }
  | { kind: "wrong"; result: ReadingCheckResult };

// Drops everything but letters -- this is what decides correct/incorrect, so spaces and
// punctuation are typing noise the student shouldn't be marked wrong for, wherever in the answer
// they land (mirrors checkKanaReadingAnswer's stripToLetters). No digits kept here (unlike
// kanjiMeaningMatch's normalizeCompare) -- a reading is always phonetic kana/romaji, never a bare
// numeral, so there's no legitimate answer that stripping digits could ever break.
function normalizeCompare(value: string): string {
  return value.replace(/[^\p{L}]/gu, "").toLowerCase();
}

// For the hint rendered on a wrong/alternate answer -- punctuation/symbols are kept as typed,
// only whitespace runs are collapsed to one space and trimmed so the hint still reads cleanly.
// Only ever used once an answer has already failed the stricter normalizeCompare match above, so
// this never affects correct/incorrect -- purely how the hint is displayed.
function normalizeDiffDisplay(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

interface ReadingVariant {
  /** Letters only, lowercased -- the exact-match key an answer's own compare is checked against. */
  compare: string;
  /** Spaces-preserved counterpart of `compare`, used to build the diff/alternate-reading hint. */
  diffDisplay: string;
  diffCompare: string;
}

function collectVariants(values: (string | null | undefined)[]): ReadingVariant[] {
  const variants = new Map<string, ReadingVariant>();
  for (const raw of values) {
    if (!raw) continue;
    const compare = normalizeCompare(raw);
    if (!compare || variants.has(compare)) continue;
    const diffDisplay = normalizeDiffDisplay(raw);
    variants.set(compare, { compare, diffDisplay, diffCompare: diffDisplay.toLowerCase() });
  }
  return Array.from(variants.values());
}

function findClosest(compareInput: string, variants: ReadingVariant[]): ReadingVariant {
  let best = variants[0];
  let bestDist = Infinity;
  for (const variant of variants) {
    // Ranked on the strict (spaces-stripped) form -- see normalizeCompare.
    const dist = levenshteinDistance(compareInput, variant.compare);
    if (dist < bestDist) {
      bestDist = dist;
      best = variant;
    }
  }
  return best;
}

/**
 * public.vocabulary.word isn't unique -- the same written word can have
 * several rows with different readings (e.g. 中 as なか vs ちゅう), and
 * get_due_cards.all_word_readings aggregates all of them regardless of which
 * one this specific card is testing. Typing one of those sibling readings is
 * a real, valid reading of the word, but not the one being tested here, so
 * it's reported as "alternate" rather than accepted outright -- the caller
 * should prompt for another reading instead of ending the review. Only a
 * match against this row's own kana_reading/romaji_reading/other_readings
 * ("target") ends the review as correct.
 *
 * `extendedMatch` (only passed while the student has "Extended romaji" on -- see
 * matchesExtendedRomaji) widens what counts as this row's own reading, and is consulted last: after
 * the exact target and sibling checks above, so it can only ever turn an answer that would have
 * been "wrong" into "target", never change what an already-matching answer is. It receives the
 * normalized (letters-only, lowercase) input. The diff on a wrong answer still only ever compares
 * against the readings above, never against an extended spelling.
 */
export function checkKanjiReadingAnswer(
  input: string,
  kanaReading: string | null,
  romajiReading: string | null,
  otherReadings: string[] | null,
  allWordReadings: string[] | null,
  extendedMatch?: (normalizedInput: string) => boolean
): ReadingCheckOutcome {
  const compare = normalizeCompare(input);
  const diffDisplay = normalizeDiffDisplay(input);

  const targetVariants = collectVariants([kanaReading, romajiReading, ...(otherReadings ?? [])]);
  if (targetVariants.some((v) => v.compare === compare)) {
    return { kind: "target", result: { correct: true, userDiff: [], targetDiff: [] } };
  }

  const targetCompareSet = new Set(targetVariants.map((v) => v.compare));
  const alternateVariants = collectVariants(allWordReadings ?? []).filter((v) => !targetCompareSet.has(v.compare));
  const alternateMatch = alternateVariants.find((v) => v.compare === compare);
  if (alternateMatch) {
    return { kind: "alternate", display: alternateMatch.diffDisplay };
  }

  if (extendedMatch?.(compare)) {
    return { kind: "target", result: { correct: true, userDiff: [], targetDiff: [] } };
  }

  if (targetVariants.length === 0) {
    return { kind: "wrong", result: { correct: false, userDiff: [], targetDiff: [] } };
  }

  const closest = findClosest(compare, targetVariants);
  const { userDiff, targetDiff } = levenshteinAlign(
    diffDisplay.toLowerCase(),
    diffDisplay,
    closest.diffCompare,
    closest.diffDisplay
  );
  return { kind: "wrong", result: { correct: false, userDiff, targetDiff } };
}
