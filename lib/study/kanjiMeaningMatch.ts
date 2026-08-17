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

export type VocabMeaningOutcome =
  | { kind: "target"; result: MeaningCheckResult; siblingMeanings: string[] }
  | { kind: "alternate"; meanings: string[] }
  | { kind: "wrong"; result: MeaningCheckResult; siblingMeanings: string[] };

/**
 * public.vocabulary.word isn't unique -- the same written word can have several
 * rows with different senses, and get_due_cards.all_word_meanings aggregates
 * meanings across every row sharing this row's (word, kana_reading) pair.
 * Typing one of those sibling meanings is a real, valid sense of the word, but
 * not the one this card is testing, so it's reported as "alternate" rather than
 * accepted outright -- the caller should prompt for another meaning instead of
 * ending the review. A match against this row's own word_meanings ("target")
 * ends the review as correct, even if the answer also names a sibling meaning
 * alongside it.
 *
 * This function only classifies a single answer -- it has no memory of sibling
 * meanings confirmed by earlier answers in the same review, so "alternate" and
 * "wrong" report the *matched meanings*, not a ready-to-display string. The
 * caller (which does track what's already been confirmed) decides which of
 * those meanings are actually new before displaying anything, so re-typing an
 * already-confirmed meaning -- alone or grouped with another already-confirmed
 * one -- doesn't add a duplicate checkmark.
 */
export function checkVocabMeaningAnswer(input: string, wordMeanings: string[], allWordMeanings: string[]): VocabMeaningOutcome {
  const combinedResult = checkKanjiMeaningAnswer(input, allWordMeanings);
  if (!combinedResult.correct) {
    // At least one typed token isn't a valid meaning anywhere. A token that matches
    // nothing gets diffed against this row's own meanings, so the suggestion points
    // at what's actually being tested. A token that matches only a sibling row's
    // meaning is still a genuinely valid answer -- rather than diffing it too (or
    // showing it as a plain correct token here), its meaning is reported via
    // siblingMeanings, so the caller can surface it the same way a standalone
    // sibling answer would: a confirmed checkmark above the target, not a token
    // in this list.
    const targetResult = checkKanjiMeaningAnswer(input, wordMeanings);
    const tokens: TokenResult[] = [];
    const seenRaw = new Set<string>();
    combinedResult.tokens.forEach((token, i) => {
      const targetToken = targetResult.tokens[i] ?? token;
      const matchesOnlySibling = !targetToken.correct && token.correct;
      if (matchesOnlySibling) return;
      // Typing the same token twice (e.g. "a, a") would otherwise produce two
      // identical boxes here -- same raw text always means the same diff/closest
      // guess, so only the first occurrence is worth showing.
      const key = targetToken.raw.trim().toLowerCase();
      if (seenRaw.has(key)) return;
      seenRaw.add(key);
      tokens.push(targetToken);
    });

    const siblingMeanings = combinedResult.matchedMeanings
      .filter((m) => !wordMeanings.includes(m.meaning))
      .map((m) => m.meaning);

    return { kind: "wrong", result: { correct: false, tokens, matchedMeanings: targetResult.matchedMeanings }, siblingMeanings };
  }

  // Every typed token is a valid meaning somewhere. If any of them is one of this
  // row's own meanings, the answer demonstrates the tested sense -- end the review,
  // even if another token alongside it only matches a sibling row's meaning. That
  // sibling meaning is still reported (as siblingMeanings), so the caller shows it
  // the same confirmed-checkmark way a standalone sibling answer would, instead of
  // silently dropping it just because the review happened to end on this answer.
  const matchesTarget = combinedResult.matchedMeanings.some((m) => wordMeanings.includes(m.meaning));
  if (matchesTarget) {
    const siblingMeanings = combinedResult.matchedMeanings
      .filter((m) => !wordMeanings.includes(m.meaning))
      .map((m) => m.meaning);
    return { kind: "target", result: combinedResult, siblingMeanings };
  }

  return { kind: "alternate", meanings: combinedResult.matchedMeanings.map((m) => m.meaning) };
}
