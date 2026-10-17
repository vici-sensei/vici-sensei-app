import {
  dropKanjiWordVocabulary,
  markKanjiWordsStale,
  patchCandidates,
  patchKanjiWordMeanings,
  patchKanjiWordTuples,
} from "@/lib/client-data/adminKanjiWords";
import type { VocabularyReviewResult, VocabularyUpdateResult } from "@/lib/types";
import { levelGap } from "./wordLabels";

/*
 * What /admin/kanji-words remembers of itself while the tab is open, so that coming back from a word's page (the
 * pencil on a word card) puts everything back as it was: the list's scroll, rows shown and ticks, and the kanji's
 * panel with its unsaved ticks, note, toggles and scroll. Plus what a word saved anywhere changes in the page's data
 * kept in memory (lib/client-data/adminKanjiWords.ts).
 */

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------

export interface PageMemory {
  /** The page's query (search, filters, sort, kanji): the rest only applies to the same view. */
  qs: string;
  limit: number;
  checked: number[];
  listScroll: number;
  windowScroll: number;
}

let page: PageMemory | null = null;

export function rememberPage(memory: PageMemory) {
  page = memory;
}

/** What the page left, if it was this view. Read while the page first renders, cleared once it is on screen. */
export function peekPageMemory(qs: string): PageMemory | null {
  return page?.qs === qs ? page : null;
}

export function clearPageMemory() {
  page = null;
}

// ---------------------------------------------------------------------------
// The kanji's panel, and the word page opened from it
// ---------------------------------------------------------------------------

export interface PanelMemory {
  kanjiId: number;
  selected: number[];
  note: string;
  tab: "words" | "history";
  showAll: boolean;
  showDisabled: boolean;
  restText: string;
  restGroup: number | null;
  restLimit: number;
  /** The card's own scroll (a wide screen) and the sheet's around it (a phone). */
  cardScroll: number;
  sheetScroll: number;
}

/** What the word page needs of the kanji it was opened from. */
export interface WordTrail {
  kanjiId: number;
  /** The kanji character, for the way back. */
  kanji: string;
  /** The page as it was, filters included. */
  returnHref: string;
  /** The candidates in the order the panel showed them: the word page's ‹ › walk through them. */
  order: number[];
  /** The word whose page is open (or was last): the panel scrolls to its card and lights it up on return. */
  opened: number;
}

let panel: PanelMemory | null = null;
let trail: WordTrail | null = null;

/** The pencil on a word card: the panel as it is now, and the way back for the word page. */
export function rememberPanel(memory: PanelMemory, wordTrail: WordTrail) {
  panel = memory;
  trail = wordTrail;
}

/** The panel as the pencil left it, if it is this kanji's. Read while the panel first renders, cleared (with the
 *  word to light up) once it is on screen: it applies to one return only. */
export function peekPanelMemory(kanjiId: number): PanelMemory | null {
  return panel?.kanjiId === kanjiId ? panel : null;
}

/** The word page's link to the kanji it was opened from, if it was this one (in this tab). */
export function wordTrailFor(kanjiId: number | null): WordTrail | null {
  return trail && trail.kanjiId === kanjiId ? trail : null;
}

/** ‹ › moved to another word: that's the card to light up back on the kanji. */
export function setTrailOpened(kanjiWordId: number) {
  if (trail) trail = { ...trail, opened: kanjiWordId };
}

/** The word to light up in the kanji's panel (null: none, or not this kanji). */
export function peekOpenedWord(kanjiId: number): number | null {
  return trail && trail.kanjiId === kanjiId && trail.opened >= 0 ? trail.opened : null;
}

/** The panel is back on screen: what it was left with is used up. The word page's trail stays (for Forward). */
export function clearPanelMemory() {
  panel = null;
  if (trail) trail = { ...trail, opened: -1 };
}

// ---------------------------------------------------------------------------
// A word saved (its page, from here or from /admin/words): the data kept in memory follows
// ---------------------------------------------------------------------------

export function applyWordSave(result: VocabularyUpdateResult) {
  const v = result.vocabulary;
  const ids = new Set(result.kanji_word_ids);
  if (ids.size === 0) return;
  patchCandidates(ids, (c, kanji) => ({
    ...c,
    kana: v.kana_reading,
    furiganas: v.furiganas,
    meanings: v.short_meaning ? [v.short_meaning, ...(v.primary_meanings ?? [])] : v.primary_meanings,
    short: v.short_meaning,
    primary: v.primary_meanings ?? [],
    other: v.other_meanings ?? [],
    jlpt: v.jlpt_level,
    gap: levelGap(v.jlpt_level, kanji.lv),
    common: v.is_common_jisho ?? false,
    usually_kana: v.usually_kana ?? false,
    enabled: v.study_enabled,
  }));
  patchKanjiWordTuples(ids, ([id, word], row) => [id, word, v.jlpt_level, levelGap(v.jlpt_level, row.lv), v.is_common_jisho ?? false]);
  patchKanjiWordMeanings(
    Object.fromEntries([...ids].map((id) => [String(id), [v.short_meaning, v.primary_meanings ?? [], v.other_meanings ?? []]]))
  );
  dropKanjiWordVocabulary(ids);
  // The patches show the change at once; the list is still read again (in the background) on the next visit.
  markKanjiWordsStale();
}

export function applyWordReview(result: VocabularyReviewResult) {
  patchCandidates(new Set(result.kanji_word_ids), (c) => ({ ...c, reviewed: result.reviewed }));
}
