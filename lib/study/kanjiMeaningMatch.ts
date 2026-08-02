import { levenshteinAlign, levenshteinDistance, type DiffChar } from "./diff";

export interface TokenResult {
  raw: string;
  correct: boolean;
  closestMeaning?: string;
  userDiff?: DiffChar[];
  targetDiff?: DiffChar[];
}

export interface MatchedMeaning {
  meaning: string;
  // "core" when the user typed only the non-parenthetical part (e.g. "door"
  // for "door (esp. Japanese-style)") — only that part should be highlighted.
  highlight: "full" | "core";
}

export interface MeaningCheckResult {
  correct: boolean;
  tokens: TokenResult[];
  matchedMeanings: MatchedMeaning[];
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
    return { correct: false, tokens: [], matchedMeanings: [] };
  }

  const meaningVariantsList = meanings.map((meaning) => meaningVariants(meaning));
  const variantSets = meaningVariantsList.map((variants) => new Set(variants.map((v) => v.compare)));

  const parsed = tokens.map((raw) => ({
    raw,
    display: normalizeDisplay(raw),
    compare: normalize(raw),
  }));
  const matchedIndex = parsed.map(({ compare }) => variantSets.findIndex((set) => set.has(compare)));

  // Meanings already claimed by an exact-match token shouldn't also be suggested
  // as the "closest" guess for a different, wrong token in the same answer.
  const consumed = new Set(matchedIndex.filter((i) => i !== -1));
  const remainingMeanings = meanings.filter((_, i) => !consumed.has(i));
  const candidateMeanings = remainingMeanings.length > 0 ? remainingMeanings : meanings;

  const results: TokenResult[] = parsed.map(({ raw, display, compare }, i) => {
    if (matchedIndex[i] !== -1) {
      return { raw, correct: true };
    }
    const closest = findClosest(compare, candidateMeanings);
    const { userDiff, targetDiff } = levenshteinAlign(compare, display, closest.compare, closest.display);
    return { raw, correct: false, closestMeaning: closest.meaning, userDiff, targetDiff };
  });

  const matchedMeanings: MatchedMeaning[] = [];
  const seenMeaningIndexes = new Set<number>();
  parsed.forEach(({ compare }, i) => {
    const idx = matchedIndex[i];
    if (idx === -1 || seenMeaningIndexes.has(idx)) return;
    seenMeaningIndexes.add(idx);
    const variants = meaningVariantsList[idx];
    const matchedVariant = variants.find((v) => v.compare === compare);
    const highlight = variants.length > 1 && matchedVariant === variants[0] ? "core" : "full";
    matchedMeanings.push({ meaning: meanings[idx], highlight });
  });

  return { correct: results.every((r) => r.correct), tokens: results, matchedMeanings };
}
