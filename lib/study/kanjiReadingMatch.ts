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

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

interface ReadingVariant {
  compare: string;
  display: string;
}

function collectVariants(values: (string | null | undefined)[]): ReadingVariant[] {
  const variants = new Map<string, ReadingVariant>();
  for (const display of values) {
    if (!display) continue;
    const trimmed = display.trim();
    if (!trimmed) continue;
    const compare = trimmed.toLowerCase();
    if (!variants.has(compare)) variants.set(compare, { compare, display: trimmed });
  }
  return Array.from(variants.values());
}

function findClosest(compareInput: string, variants: ReadingVariant[]): ReadingVariant {
  let best = variants[0];
  let bestDist = Infinity;
  for (const variant of variants) {
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
 */
export function checkKanjiReadingAnswer(
  input: string,
  kanaReading: string | null,
  romajiReading: string | null,
  otherReadings: string[] | null,
  allWordReadings: string[] | null
): ReadingCheckOutcome {
  const display = input.trim();
  const compare = normalize(input);

  const targetVariants = collectVariants([kanaReading, romajiReading, ...(otherReadings ?? [])]);
  if (targetVariants.some((v) => v.compare === compare)) {
    return { kind: "target", result: { correct: true, userDiff: [], targetDiff: [] } };
  }

  const targetCompareSet = new Set(targetVariants.map((v) => v.compare));
  const alternateVariants = collectVariants(allWordReadings ?? []).filter((v) => !targetCompareSet.has(v.compare));
  const alternateMatch = alternateVariants.find((v) => v.compare === compare);
  if (alternateMatch) {
    return { kind: "alternate", display: alternateMatch.display };
  }

  if (targetVariants.length === 0) {
    return { kind: "wrong", result: { correct: false, userDiff: [], targetDiff: [] } };
  }

  const closest = findClosest(compare, targetVariants);
  const { userDiff, targetDiff } = levenshteinAlign(compare, display, closest.compare, closest.display);
  return { kind: "wrong", result: { correct: false, userDiff, targetDiff } };
}
