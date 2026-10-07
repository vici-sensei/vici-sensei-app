import type { KanaExtendedRomaji, WordKanji } from "@/lib/types";
import { matchesExtendedRomaji } from "./extendedRomajiMatch";
import { kanaToRomaji, toHiragana } from "./kanaToRomaji";
import { checkKanjiMeaningAnswer, checkVocabMeaningAnswer, splitAnswer, type MeaningCheckResult } from "./kanjiMeaningMatch";

/**
 * "Alternate" answers: something the student typed that is real knowledge about the card, but not
 * what the card asks for. It gets a checkmark (ConfirmedAnswersList) and the card asks again,
 * instead of being marked wrong -- it never counts toward the rating either way, only the final
 * answer does.
 *
 *  - sibling                 a homograph's other meaning/reading (see checkVocabMeaningAnswer /
 *                            checkKanjiReadingAnswer)
 *  - reading                 Kanji meaning: a kun/on reading of the kanji;
 *                            Vocab meaning: the word's own reading
 *  - kanji_meaning           Vocab meaning: the meaning of one of the word's kanji (note = the kanji)
 *  - meaning                 Word reading: the word's meaning
 *  - kanji_reading_part      Word reading: just the tested kanji's reading inside this word (note = kanji)
 *  - kanji_reading_elsewhere Word reading: a reading of the tested kanji this word doesn't use (note = kanji)
 */
export type AlternateKind =
  | "sibling"
  | "reading"
  | "kanji_meaning"
  | "meaning"
  | "kanji_reading_part"
  | "kanji_reading_elsewhere";

export interface ConfirmedAlternate {
  text: string;
  kind: AlternateKind;
  /** Shown next to the checkmark -- the kanji a kanji_meaning / kanji_reading_* alternate belongs to. */
  note?: string;
}

export type AlternateOutcome<TResult> =
  | { kind: "alternate"; alternates: ConfirmedAlternate[] }
  | { kind: "final"; result: TResult; correct: boolean; alternates?: ConfirmedAlternate[] };

export type ExtendedUnits = KanaExtendedRomaji["units"] | null;

/** Letters only, lowercase -- same rule every reading comparison in the app uses (kanjiReadingMatch's
 * normalizeCompare). Kana and ー are letters, so a kana answer survives intact. */
function normalizeReading(value: string): string {
  return value.replace(/[^\p{L}]/gu, "").toLowerCase();
}

function pushUnique(list: ConfirmedAlternate[], item: ConfirmedAlternate) {
  if (!list.some((a) => a.kind === item.kind && a.text === item.text)) list.push(item);
}

interface ReadingCandidate {
  /** What the checkmark shows -- always kana, however the student typed it. */
  display: string;
  /** Pure kana, what the typed answer (kana, Hepburn romaji or an extended spelling) is checked against. */
  kana: string;
  /** Extra stored romaji spellings (vocabulary.romaji_reading). */
  romaji: string[];
}

function readingMatches(normalizedInput: string, candidate: ReadingCandidate, units: ExtendedUnits): boolean {
  if (!normalizedInput) return false;
  const kana = normalizeReading(candidate.kana);
  if (!kana) return false;
  if (toHiragana(normalizedInput) === toHiragana(kana)) return true;
  if (candidate.romaji.some((r) => normalizeReading(r) === normalizedInput)) return true;
  if (!/^[a-z]+$/.test(normalizedInput)) return false;
  if (kanaToRomaji(kana) === normalizedInput) return true;
  return !!units && matchesExtendedRomaji(normalizedInput, kana, units);
}

/** The forms of one public.kanji reading a student may type: "ひと.つ" (okurigana after the dot) is
 * both ひと and ひとつ, "-り" / "ひと-" (affix markers) are just り / ひと. Parenthesised okurigana
 * ("ひと(つ)") is handled the same way as the dot. */
export function kanjiReadingForms(raw: string): string[] {
  const cleaned = raw.replace(/[-－‐〜~]/g, "").trim();
  if (!cleaned) return [];
  const forms = new Set<string>();
  let base = cleaned;
  const paren = cleaned.match(/^(.*?)[(（](.*?)[)）](.*)$/);
  if (paren) {
    forms.add(paren[1]);
    base = paren[1] + paren[2] + paren[3];
  }
  if (base.includes(".")) {
    forms.add(base.split(".")[0]);
    forms.add(base.replace(/\./g, ""));
  } else {
    forms.add(base);
  }
  return Array.from(forms).filter(Boolean);
}

function kanjiReadingCandidates(readings: string[] | null | undefined): ReadingCandidate[] {
  const seen = new Set<string>();
  const out: ReadingCandidate[] = [];
  for (const raw of readings ?? []) {
    for (const form of kanjiReadingForms(raw)) {
      const key = toHiragana(form);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ display: form, kana: form, romaji: [] });
    }
  }
  return out;
}

const LATIN = /^[\sa-zA-Z'’\-āīūēōĀĪŪĒŌ]+$/;

function wordReadingCandidates(
  kanaReading: string | null | undefined,
  romajiReading: string | null | undefined,
  otherReadings: string[] | null | undefined
): ReadingCandidate[] {
  if (!kanaReading) return [];
  const romaji = [romajiReading, ...(otherReadings ?? []).filter((r) => LATIN.test(r))].filter((r): r is string => !!r);
  const out: ReadingCandidate[] = [{ display: kanaReading, kana: kanaReading, romaji }];
  for (const other of otherReadings ?? []) {
    if (other && !LATIN.test(other)) out.push({ display: other, kana: other, romaji: [] });
  }
  return out;
}

/** Kanji meaning card: a token that is one of the kanji's readings (and not also one of its
 * meanings) is peeled off as an alternate; whatever else was typed is graded as usual. */
export function checkKanjiMeaningCard(
  input: string,
  meanings: string[],
  kanjiReadings: string[] | null | undefined,
  units: ExtendedUnits
): AlternateOutcome<MeaningCheckResult> {
  const candidates = kanjiReadingCandidates(kanjiReadings);
  const rest: string[] = [];
  const alternates: ConfirmedAlternate[] = [];
  for (const token of splitAnswer(input)) {
    if (checkKanjiMeaningAnswer(token, meanings).correct) {
      rest.push(token);
      continue;
    }
    const normalized = normalizeReading(token);
    const reading = candidates.find((c) => readingMatches(normalized, c, units));
    if (reading) pushUnique(alternates, { text: reading.display, kind: "reading" });
    else rest.push(token);
  }

  if (rest.length === 0 && alternates.length > 0) return { kind: "alternate", alternates };
  const result = checkKanjiMeaningAnswer(rest.join(", "), meanings);
  return { kind: "final", result, correct: result.correct, alternates: alternates.length > 0 ? alternates : undefined };
}

export interface VocabMeaningCardData {
  primaryMeanings: string[];
  /** get_vocab_meaning_pool -- every sense of this word + reading (sibling senses included). */
  allMeanings: string[];
  kanaReading: string | null | undefined;
  romajiReading: string | null | undefined;
  otherReadings: string[] | null | undefined;
  wordKanji: WordKanji[] | null | undefined;
}

/** Vocab meaning card. Per typed token, in priority order: one of the word's senses (this row's own,
 * or a sibling sense -- checkVocabMeaningAnswer sorts those out), the word's reading, the meaning of
 * one of its kanji. Tokens of the last two kinds are peeled off as alternates. */
export function checkVocabMeaningCard(
  input: string,
  data: VocabMeaningCardData,
  units: ExtendedUnits
): AlternateOutcome<MeaningCheckResult> {
  const pool = data.allMeanings.length > 0 ? data.allMeanings : data.primaryMeanings;
  const readings = wordReadingCandidates(data.kanaReading, data.romajiReading, data.otherReadings);
  const rest: string[] = [];
  const peeled: ConfirmedAlternate[] = [];

  for (const token of splitAnswer(input)) {
    if (checkKanjiMeaningAnswer(token, pool).correct) {
      rest.push(token);
      continue;
    }
    const normalized = normalizeReading(token);
    const reading = readings.find((c) => readingMatches(normalized, c, units));
    if (reading) {
      pushUnique(peeled, { text: reading.display, kind: "reading" });
      continue;
    }
    let kanjiMatch: ConfirmedAlternate | null = null;
    for (const wk of data.wordKanji ?? []) {
      const check = checkKanjiMeaningAnswer(token, wk.meanings ?? []);
      if (check.correct && check.matchedMeanings.length > 0) {
        kanjiMatch = { text: check.matchedMeanings[0].meaning, kind: "kanji_meaning", note: wk.kanji };
        break;
      }
    }
    if (kanjiMatch) pushUnique(peeled, kanjiMatch);
    else rest.push(token);
  }

  if (rest.length === 0 && peeled.length > 0) return { kind: "alternate", alternates: peeled };

  const outcome = checkVocabMeaningAnswer(rest.join(", "), data.primaryMeanings, pool);
  const siblings = (outcome.kind === "alternate" ? outcome.meanings : outcome.siblingMeanings).map(
    (text): ConfirmedAlternate => ({ text, kind: "sibling" })
  );
  const alternates = [...siblings, ...peeled];
  if (outcome.kind === "alternate") return { kind: "alternate", alternates };
  return {
    kind: "final",
    result: outcome.result,
    correct: outcome.result.correct,
    alternates: alternates.length > 0 ? alternates : undefined,
  };
}

export interface KanjiReadingCardData {
  kanjiChar: string | null | undefined;
  word: string | null | undefined;
  furiganas: string[] | null | undefined;
  kanjiReadings: string[] | null | undefined;
  /** The word's meanings -- get_vocab_meaning_pool when the card carries it, else its primary meanings. */
  wordMeanings: string[];
}

/** The tested kanji's own furigana inside the word, when it has one of its own (not shared with a
 * neighbour, as in jukujikun like 大人 おとな). */
function targetFurigana(data: KanjiReadingCardData): string | null {
  if (!data.word || !data.kanjiChar || !data.furiganas) return null;
  const chars = Array.from(data.word);
  if (data.furiganas.length !== chars.length) return null;
  const idx = chars.indexOf(data.kanjiChar);
  if (idx === -1) return null;
  const own = data.furiganas[idx];
  if (!own || own === "-" || data.furiganas[idx + 1] === "-") return null;
  return own;
}

/** Word reading card, only consulted once checkKanjiReadingAnswer has already found the answer
 * wrong (so neither the word's reading nor a sibling reading): is it just the tested kanji's part of
 * the reading, another reading of that kanji, or the word's meaning? Null when it's none of those. */
export function checkKanjiReadingCardExtras(
  input: string,
  data: KanjiReadingCardData,
  units: ExtendedUnits
): ConfirmedAlternate | null {
  const normalized = normalizeReading(input);
  const kanji = data.kanjiChar ?? undefined;
  // Only for a word longer than the kanji itself -- for a one-kanji word its reading IS the answer.
  const part = data.word && data.word !== data.kanjiChar ? targetFurigana(data) : null;

  if (normalized) {
    if (part && readingMatches(normalized, { display: part, kana: part, romaji: [] }, units)) {
      return { text: part, kind: "kanji_reading_part", note: kanji };
    }
    const reading = kanjiReadingCandidates(data.kanjiReadings).find((c) => readingMatches(normalized, c, units));
    if (reading) return { text: reading.display, kind: "kanji_reading_elsewhere", note: kanji };
  }

  if (data.wordMeanings.length > 0) {
    const meaning = checkKanjiMeaningAnswer(input, data.wordMeanings);
    if (meaning.correct && meaning.matchedMeanings.length > 0) {
      return { text: meaning.matchedMeanings.map((m) => m.meaning).join(", "), kind: "meaning" };
    }
  }
  return null;
}
