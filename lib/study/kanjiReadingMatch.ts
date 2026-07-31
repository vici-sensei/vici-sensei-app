import { levenshteinAlign, levenshteinDistance, type DiffChar } from "./diff";

export interface ReadingCheckResult {
  correct: boolean;
  userDiff: DiffChar[];
  targetDiff: DiffChar[];
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

interface ReadingVariant {
  compare: string;
  display: string;
}

function collectVariants(
  kanaReading: string | null,
  romajiReading: string | null,
  otherReadings: string[] | null
): ReadingVariant[] {
  const raw = [kanaReading, romajiReading, ...(otherReadings ?? [])];
  const variants = new Map<string, ReadingVariant>();
  for (const display of raw) {
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
 * Correct iff the (normalized) input matches kana_reading, romaji_reading,
 * or any entry in other_readings -- the user only ever types one of them,
 * so unlike meaning-checking there's no comma-separated token splitting.
 */
export function checkKanjiReadingAnswer(
  input: string,
  kanaReading: string | null,
  romajiReading: string | null,
  otherReadings: string[] | null
): ReadingCheckResult {
  const display = input.trim();
  const compare = normalize(input);
  const variants = collectVariants(kanaReading, romajiReading, otherReadings);

  if (variants.some((v) => v.compare === compare)) {
    return { correct: true, userDiff: [], targetDiff: [] };
  }
  if (variants.length === 0) {
    return { correct: false, userDiff: [], targetDiff: [] };
  }

  const closest = findClosest(compare, variants);
  const { userDiff, targetDiff } = levenshteinAlign(compare, display, closest.compare, closest.display);
  return { correct: false, userDiff, targetDiff };
}
