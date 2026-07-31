import { levenshteinAlign, levenshteinDistance, type DiffChar } from "./diff";

export interface TokenResult {
  raw: string;
  correct: boolean;
  closestMeaning?: string;
  userDiff?: DiffChar[];
  targetDiff?: DiffChar[];
}

export interface MeaningCheckResult {
  correct: boolean;
  tokens: TokenResult[];
}

function normalizeDisplay(value: string): string {
  return value
    .trim()
    .replace(/[.!?]+$/g, "")
    .replace(/\s+/g, " ");
}

function normalize(value: string): string {
  return normalizeDisplay(value).toLowerCase();
}

interface MeaningVariant {
  compare: string;
  display: string;
}

// "(fighting) spirit" is accepted as both "spirit" and "fighting spirit" —
// the parenthetical is a sense qualifier, not literal text to type. `display`
// keeps the original casing (e.g. "Japan") so diffs can show it; `compare`
// is the lowercased form matching/alignment actually run on.
function meaningVariants(meaning: string): MeaningVariant[] {
  const shortDisplay = normalizeDisplay(meaning.replace(/\([^)]*\)/g, " "));
  const longDisplay = normalizeDisplay(meaning.replace(/[()]/g, ""));
  const variants = new Map<string, MeaningVariant>();
  for (const display of [shortDisplay, longDisplay]) {
    if (!display) continue;
    const compare = display.toLowerCase();
    if (!variants.has(compare)) variants.set(compare, { compare, display });
  }
  return Array.from(variants.values());
}

function splitAnswer(input: string): string[] {
  return input
    .split(/[,;]/)
    .map((token) => token.trim())
    .filter(Boolean);
}

function findClosest(
  compareToken: string,
  acceptedMeanings: string[]
): { meaning: string; compare: string; display: string } {
  let best: { meaning: string; compare: string; display: string } | null = null;
  let bestDist = Infinity;
  for (const meaning of acceptedMeanings) {
    for (const variant of meaningVariants(meaning)) {
      const dist = levenshteinDistance(compareToken, variant.compare);
      if (dist < bestDist) {
        bestDist = dist;
        best = { meaning, compare: variant.compare, display: variant.display };
      }
    }
  }
  return best ?? { meaning: acceptedMeanings[0], compare: "", display: "" };
}

/**
 * Correct iff every comma/semicolon-separated token the user typed matches
 * (after normalization) some accepted meaning — order doesn't matter, and the
 * user doesn't need to type every accepted meaning, just what they type must
 * be valid.
 */
export function checkKanjiMeaningAnswer(input: string, acceptedMeanings: string[]): MeaningCheckResult {
  const tokens = splitAnswer(input);
  const meanings = acceptedMeanings.filter(Boolean);
  if (tokens.length === 0 || meanings.length === 0) {
    return { correct: false, tokens: [] };
  }

  const variantSets = meanings.map((meaning) => new Set(meaningVariants(meaning).map((v) => v.compare)));

  const results: TokenResult[] = tokens.map((raw) => {
    const display = normalizeDisplay(raw);
    const compare = normalize(raw);
    const isCorrect = variantSets.some((set) => set.has(compare));
    if (isCorrect) {
      return { raw, correct: true };
    }
    const closest = findClosest(compare, meanings);
    const { userDiff, targetDiff } = levenshteinAlign(compare, display, closest.compare, closest.display);
    return { raw, correct: false, closestMeaning: closest.meaning, userDiff, targetDiff };
  });

  return { correct: results.every((r) => r.correct), tokens: results };
}
