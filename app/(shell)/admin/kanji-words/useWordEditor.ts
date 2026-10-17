"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { patchCachedWord, setCachedReview } from "@/lib/client-data/adminWords";
import { createClient } from "@/lib/supabase/client";
import {
  describeKanjiWordsError,
  fetchVocabularyEdits,
  isVocabularyConflict,
  restoreVocabulary,
  setVocabularyReviewed,
  updateVocabulary,
} from "@/lib/data/adminKanjiWords";
import { useToast } from "@/app/components/ui/Toast";
import type {
  KanjiWordVocabulary,
  VocabularyEdit,
  VocabularyEditable,
  VocabularyReviewMark,
  VocabularyReviewResult,
  VocabularyUpdateResult,
} from "@/lib/types";
import { applyMove, itemMoved, newId, placesOf, textsOf, toItems, toSenses, type DragLists, type Item } from "./meaningsDraft";
import { highlightOf, listPlaceholder, useListDrag } from "./useListDrag";
import { dropRing } from "./wordEditorParts";

/** The editable columns as the form shows them: every text and list present (empty instead of null), and the
 *  furigana lists exactly one entry per character of the word. */
interface FormValues {
  kana_reading: string;
  romaji_reading: string;
  furiganas: string[];
  romaji_furiganas: string[];
  other_readings: string[];
  short_meaning: string;
  primary_meanings: string[];
  other_meanings: string[][];
  parts_of_speech: string[];
  jlpt_level: string | null;
  is_common_jisho: boolean;
  usually_kana: boolean;
  study_enabled: boolean;
}

/** What the form edits: FormValues, with the lists that can be rearranged by dragging held as entries with ids. */
export type Draft = Omit<FormValues, keyof DragLists> & DragLists;

function formOf(v: KanjiWordVocabulary): FormValues {
  const chars = Array.from(v.word).length;
  const perChar = (list: string[] | null) => Array.from({ length: chars }, (_, i) => list?.[i] ?? "");
  return {
    kana_reading: v.kana_reading ?? "",
    romaji_reading: v.romaji_reading ?? "",
    furiganas: perChar(v.furiganas),
    romaji_furiganas: perChar(v.romaji_furiganas),
    other_readings: v.other_readings ?? [],
    short_meaning: v.short_meaning ?? "",
    primary_meanings: v.primary_meanings ?? [],
    other_meanings: v.other_meanings ?? [],
    parts_of_speech: v.parts_of_speech ?? [],
    jlpt_level: v.jlpt_level,
    is_common_jisho: v.is_common_jisho ?? false,
    usually_kana: v.usually_kana ?? false,
    study_enabled: v.study_enabled,
  };
}

/** A fresh form for the word: every entry gets an id, nothing counts as moved. */
function toDraft(v: KanjiWordVocabulary): Draft {
  const form = formOf(v);
  return {
    ...form,
    short_meaning: { id: newId(), text: form.short_meaning, home: "S" },
    primary_meanings: toItems(form.primary_meanings, "P"),
    other_meanings: toSenses(form.other_meanings),
    other_readings: toItems(form.other_readings, "R"),
    parts_of_speech: toItems(form.parts_of_speech, "POS"),
    moved: [],
  };
}

function formOfDraft(d: Draft): FormValues {
  return {
    ...d,
    short_meaning: d.short_meaning.text,
    primary_meanings: textsOf(d.primary_meanings),
    other_meanings: d.other_meanings.map((sense) => textsOf(sense.items)),
    other_readings: textsOf(d.other_readings),
    parts_of_speech: textsOf(d.parts_of_speech),
  };
}

/** The editable columns exactly as loaded: what a save quotes as "expected". */
export function editableOf(v: KanjiWordVocabulary): VocabularyEditable {
  return {
    kana_reading: v.kana_reading,
    romaji_reading: v.romaji_reading,
    furiganas: v.furiganas,
    romaji_furiganas: v.romaji_furiganas,
    other_readings: v.other_readings,
    short_meaning: v.short_meaning,
    primary_meanings: v.primary_meanings,
    other_meanings: v.other_meanings,
    parts_of_speech: v.parts_of_speech,
    jlpt_level: v.jlpt_level,
    is_common_jisho: v.is_common_jisho,
    usually_kana: v.usually_kana,
    study_enabled: v.study_enabled,
  };
}

const tidy = (list: string[]) => list.map((text) => text.trim()).filter((text) => text !== "");

/** What a save sends, cleaned the way the RPC cleans it (trimmed, blank entries and emptied senses dropped), so
 *  "anything to save?" is answered the way the server would answer it. */
function tidyForm(d: FormValues): VocabularyEditable {
  return {
    kana_reading: d.kana_reading.trim(),
    romaji_reading: d.romaji_reading.trim(),
    furiganas: d.furiganas.map((text) => text.trim()),
    romaji_furiganas: d.romaji_furiganas.map((text) => text.trim()),
    other_readings: tidy(d.other_readings),
    short_meaning: d.short_meaning.trim() || null,
    primary_meanings: tidy(d.primary_meanings),
    other_meanings: d.other_meanings.map(tidy).filter((sense) => sense.length > 0),
    parts_of_speech: tidy(d.parts_of_speech),
    jlpt_level: d.jlpt_level,
    is_common_jisho: d.is_common_jisho,
    usually_kana: d.usually_kana,
    study_enabled: d.study_enabled,
  };
}

const toValues = (d: Draft) => tidyForm(formOfDraft(d));

/** The same checks the RPC makes, so Save says what's missing before a round trip. */
function problemsOf(values: VocabularyEditable): string[] {
  const problems: string[] = [];
  if (!values.kana_reading) problems.push("The kana reading can't be empty.");
  if (!values.romaji_reading) problems.push("The romaji can't be empty.");
  if (!values.primary_meanings?.length) problems.push("At least one primary meaning is needed.");
  return problems;
}

/** What the editor loads: the word as stored, and (where the caller doesn't know it already) its reviewed mark. */
export interface LoadedWord {
  vocabulary: KanjiWordVocabulary;
  /** Left out: the mark the editor already has stays. null = not reviewed. */
  reviewed?: VocabularyReviewMark | null;
}

interface WordEditorOptions {
  /** Changes when it is another word: loaded again from scratch. */
  wordKey: string | number;
  /** Also runs again from "Try again" and "Load the latest version", which drop the edits. */
  load: () => Promise<LoadedWord>;
  /** The reviewed mark as the caller knows it; undefined = not known (until `load` says): no reviewed controls. */
  initialReviewed: VocabularyReviewMark | null | undefined;
  /** The element holding the form: dragging looks for its entries in it. */
  rootRef: RefObject<HTMLElement | null>;
  /** The form scrolls with the page, not inside rootRef: the part of the window it is seen through. */
  viewport?: () => { top: number; bottom: number };
  /** A save, an undo or a restore changed the word (on both regions). */
  onSaved?: (result: VocabularyUpdateResult) => void;
  /** The word was marked as reviewed, or the mark was taken away (on both regions). */
  onReviewed?: (result: VocabularyReviewResult) => void;
}

/**
 * Everything the word editor does, for the popup on /admin/kanji-words and the word page of /admin/words: one word's
 * dictionary data (JLPT level, meanings, readings, usage) as a draft. The word itself is fixed and so is the furigana
 * above it, which only previews the Furigana field. Nothing is written until Save, which writes both regions at once
 * and is refused if the word changed since it was loaded.
 *
 * Every write is logged (vocabulary_edits): right after one, "Undo" takes it back; History lists them all and can go
 * back to any version, the original included. Going back is logged too, so it can be undone as well.
 *
 * "Mark as reviewed" says the word's data has been checked; the mark is the word's (every kanji's list shows it) and
 * "Mark as not reviewed" takes it away. It isn't part of the word's data, so it isn't in the History.
 */
export function useWordEditor({ wordKey, load, initialReviewed, rootRef, viewport, onSaved, onReviewed }: WordEditorOptions) {
  const { showToast } = useToast();
  const [loaded, setLoaded] = useState<KanjiWordVocabulary | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  // As the caller had it, then as the load or the last mark / unmark from here left it.
  const [reviewed, setReviewed] = useState<VocabularyReviewMark | null | undefined>(initialReviewed);
  // A write in flight, and which: a save and a review spin their own button; any of them blocks the others.
  const [writing, setWriting] = useState<"save" | "restore" | "review" | null>(null);
  const saving = writing !== null;
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [view, setView] = useState<"edit" | "history">("edit");
  // The last write made from here (a save, an undo, a restore), until the next edit: what "Undo" takes back.
  const [lastWrite, setLastWrite] = useState<{ editId: string; message: string } | null>(null);
  // The History list with the read it came from: a list from before the latest write isn't shown (the placeholder is).
  const [history, setHistory] = useState<{ key: string; edits: VocabularyEdit[] } | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyTick, setHistoryTick] = useState(0);
  // What the last drag did, for screen readers.
  const [announcement, setAnnouncement] = useState("");
  const vocabularyId = loaded?.id ?? null;
  const historyKey = `${vocabularyId}:${historyTick}`;
  const edits = history?.key === historyKey ? history.edits : null;

  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    let cancelled = false;
    loadRef
      .current()
      .then((result) => {
        if (cancelled) return;
        setLoaded(result.vocabulary);
        setDraft(toDraft(result.vocabulary));
        if (result.reviewed !== undefined) setReviewed(result.reviewed);
        setLoadError(null);
        setSaveError(null);
        setConflict(false);
        setLastWrite(null);
        setHistoryTick((tick) => tick + 1);
      })
      .catch((err) => {
        if (!cancelled) setLoadError(describeKanjiWordsError(err, "Couldn't load this word."));
      });
    return () => {
      cancelled = true;
    };
  }, [wordKey, reloadTick]);

  // The History view's list, read again after every write (historyTick).
  useEffect(() => {
    if (view !== "history" || vocabularyId === null) return;
    let cancelled = false;
    const key = `${vocabularyId}:${historyTick}`;
    fetchVocabularyEdits(createClient(), vocabularyId)
      .then((list) => {
        if (cancelled) return;
        setHistory({ key, edits: list });
        setHistoryError(null);
      })
      .catch((err) => {
        if (!cancelled) setHistoryError(describeKanjiWordsError(err, "Couldn't load this word's history."));
      });
    return () => {
      cancelled = true;
    };
  }, [view, vocabularyId, historyTick]);

  const values = draft ? toValues(draft) : null;
  // The word as stored, cleaned the same way: what the draft is compared with, as a whole and field by field.
  const stored = loaded ? tidyForm(formOf(loaded)) : null;
  const dirty = values !== null && stored !== null && JSON.stringify(values) !== JSON.stringify(stored);
  const changed = (key: keyof VocabularyEditable) =>
    values !== null && stored !== null && JSON.stringify(values[key]) !== JSON.stringify(stored[key]);
  const problems = values ? problemsOf(values) : [];

  function set(patch: Partial<Draft>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
    setSaveError(null);
    setLastWrite(null);
  }

  // Meanings, other readings and parts of speech are rearranged by dragging their handles; a drop is an edit like
  // any other (tinted until Save, undone by Discard).
  const { drag, startDrag } = useListDrag({
    scrollRef: rootRef,
    viewport,
    lists: draft,
    enabled: view === "edit" && !saving,
    onDrop: (src, target) => {
      if (!draft) return null;
      const result = applyMove(draft, src, target);
      set(result.lists);
      setAnnouncement(result.message);
      return result.flashId;
    },
    onBlocked: setAnnouncement,
  });
  const places = draft ? placesOf(draft) : null;
  const movedItem = (item: Item) => (draft && places ? itemMoved(draft, places, item) : false);
  const highlight = highlightOf(drag);
  const ringOf = (key: string) => (highlight?.key === key ? dropRing(highlight.bad) : "");
  const posPlaceholder = listPlaceholder(drag, "POS", 0);

  // A save, an undo and a restore all end the same way: the editor shows what is stored now and can undo it. `done`
  // says what happened, in the past tense ("Saved").
  async function write(
    kind: "save" | "restore",
    run: (expected: VocabularyEditable, id: number) => Promise<VocabularyUpdateResult>,
    done: string
  ) {
    if (!loaded) return;
    setWriting(kind);
    setSaveError(null);
    setConflict(false);
    try {
      const result = await run(editableOf(loaded), loaded.id);
      const next = { ...loaded, ...result.vocabulary };
      setLoaded(next);
      setDraft(toDraft(next));
      if (result.changed) {
        showToast(`${done}: ${loaded.word}.`);
        setLastWrite(result.edit_id ? { editId: result.edit_id, message: `${done}.` } : null);
        setHistoryTick((tick) => tick + 1);
        patchCachedWord(loaded.id, result.vocabulary);
        onSaved?.(result);
      } else {
        showToast("It was already like that.");
      }
    } catch (err) {
      setConflict(isVocabularyConflict(err));
      setSaveError(describeKanjiWordsError(err, "Failed to save."));
    } finally {
      setWriting(null);
    }
  }

  function save() {
    if (!values) return;
    void write(
      "save",
      (expected, vocabularyId) => updateVocabulary(createClient(), { vocabularyId, expected, values }),
      "Saved"
    );
  }

  function restore(editId: string, side: "before" | "after", done: string) {
    if (dirty && !window.confirm(`Drop your unsaved changes to ${loaded?.word ?? ""}?`)) return;
    void write(
      "restore",
      (expected, vocabularyId) => restoreVocabulary(createClient(), { vocabularyId, expected, editId, side }),
      done
    );
  }

  async function markReviewed(next: boolean) {
    if (!loaded) return;
    setWriting("review");
    setSaveError(null);
    setConflict(false);
    try {
      const result = await setVocabularyReviewed(createClient(), { vocabularyId: loaded.id, reviewed: next });
      setReviewed(result.reviewed);
      showToast(
        result.changed ? `${next ? "Marked as reviewed" : "Marked as not reviewed"}: ${loaded.word}.` : "It was already like that."
      );
      setCachedReview(loaded.id, result.reviewed);
      onReviewed?.(result);
    } catch (err) {
      setSaveError(describeKanjiWordsError(err, "Failed to save."));
    } finally {
      setWriting(null);
    }
  }

  return {
    loaded,
    draft,
    stored,
    dirty,
    changed,
    problems,
    /** The problem shown in the footer: only once something was edited, and not over the History. */
    shownProblem: dirty && view === "edit" ? problems[0] : undefined,
    loadError,
    retryLoad: () => {
      setLoadError(null);
      setReloadTick((tick) => tick + 1);
    },
    /** "Load the latest version" after a conflict: drops the edits. */
    reloadLatest: () => setReloadTick((tick) => tick + 1),
    reviewed,
    writing,
    saving,
    saveError,
    conflict,
    view,
    toggleView: () => setView((v) => (v === "edit" ? "history" : "edit")),
    lastWrite,
    edits,
    historyError,
    retryHistory: () => {
      setHistoryError(null);
      setHistoryTick((tick) => tick + 1);
    },
    set,
    discard: () => {
      if (loaded) setDraft(toDraft(loaded));
    },
    save,
    restore,
    markReviewed,
    drag,
    startDrag,
    movedItem,
    ringOf,
    posPlaceholder,
    announcement,
  };
}

export type WordEditorState = ReturnType<typeof useWordEditor>;
