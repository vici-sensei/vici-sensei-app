"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FaChevronDown, FaCircleCheck, FaPlus, FaXmark } from "react-icons/fa6";
import { createClient } from "@/lib/supabase/client";
import {
  describeKanjiWordsError,
  fetchKanjiWordVocabulary,
  fetchVocabularyEdits,
  isVocabularyConflict,
  restoreVocabulary,
  setVocabularyReviewed,
  updateVocabulary,
} from "@/lib/data/adminKanjiWords";
import { renderWordWithFurigana } from "@/lib/study/furigana";
import { Button } from "@/app/components/ui/Button";
import { levelColorClasses } from "@/app/components/ui/LevelBadge";
import { Modal } from "@/app/components/ui/Modal";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { Toggle } from "@/app/components/ui/Toggle";
import { useToast } from "@/app/components/ui/Toast";
import type {
  KanjiWordCandidate,
  KanjiWordVocabulary,
  VocabularyEdit,
  VocabularyEditable,
  VocabularyReviewMark,
  VocabularyReviewResult,
  VocabularyUpdateResult,
} from "@/lib/types";
import { formatWhen, PARTS_OF_SPEECH } from "./wordLabels";
import { WordHistory } from "./WordHistory";
import { Tag } from "./WordMeanings";

const LEVELS = ["N5", "N4", "N3", "N2", "N1"];

const INPUT =
  "rounded-lg border px-2.5 py-1.5 text-sm text-white outline-none transition-colors placeholder:text-text-muted/60 focus:border-accent-blue/40";

// What differs from the word as stored (an edit not saved yet) is tinted violet, a colour nothing else in the popup
// uses: blue is the focus, gold the short meaning, green the reviewed mark. A save or a discard clears it.
const box = (changed: boolean) =>
  changed ? "border-accent-violet/50 bg-accent-violet/[0.08]" : "border-border-soft bg-white/[0.03]";
const CHANGED_OUTLINE = "outline-2 outline-offset-2 outline-accent-violet/60";
const CHANGED_TAG = "border-accent-violet/50 bg-accent-violet/15 text-accent-violet";

function ChangedDot() {
  return <span aria-hidden className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent-violet" />;
}

/** What the form edits: the editable columns with every text and list present (empty instead of null), and the
 *  furigana lists exactly one entry per character of the word. */
interface Draft {
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

function toDraft(v: KanjiWordVocabulary): Draft {
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

/** The editable columns exactly as loaded: what a save quotes as "expected". */
function editableOf(v: KanjiWordVocabulary): VocabularyEditable {
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
function toValues(d: Draft): VocabularyEditable {
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

/** The same checks the RPC makes, so Save says what's missing before a round trip. */
function problemsOf(values: VocabularyEditable): string[] {
  const problems: string[] = [];
  if (!values.kana_reading) problems.push("The kana reading can't be empty.");
  if (!values.romaji_reading) problems.push("The romaji can't be empty.");
  if (!values.primary_meanings?.length) problems.push("At least one primary meaning is needed.");
  return problems;
}

function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-dashed border-border-soft px-2 py-1 text-xs font-bold text-text-muted transition-colors hover:border-white/25 hover:text-white"
    >
      <FaPlus className="h-2.5 w-2.5" />
      {children}
    </button>
  );
}

function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Remove"
      aria-label={label}
      className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors hover:text-white"
    >
      <FaXmark className="h-3 w-3" />
    </button>
  );
}

/** A list of short texts, each in its own input that grows with its text, side by side; × removes one, + adds one. */
function TextList({
  values,
  stored,
  onChange,
  label,
  addLabel,
}: {
  values: string[];
  /** The entries as stored: one that isn't among them (new or edited) is tinted. A removed one shows on the label. */
  stored: string[];
  onChange: (next: string[]) => void;
  /** Names one entry, for screen readers ("Primary meaning 2"). */
  label: string;
  addLabel: string;
}) {
  // Only an entry added by the + button takes the focus, not the ones there when the popup opened.
  const [added, setAdded] = useState(false);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {values.map((value, i) => (
        <span
          key={i}
          className={`inline-flex max-w-full items-center rounded-lg border transition-colors focus-within:border-accent-blue/40 ${box(
            value.trim() !== "" && !stored.includes(value.trim())
          )}`}
        >
          <input
            value={value}
            onChange={(e) => onChange(values.map((v, j) => (j === i ? e.target.value : v)))}
            autoFocus={added && i === values.length - 1}
            aria-label={`${label} ${i + 1}`}
            className="min-w-[3rem] max-w-full bg-transparent py-1 pl-2.5 text-sm text-white outline-none [field-sizing:content]"
          />
          <RemoveButton label={`Remove ${label.toLowerCase()} ${i + 1}`} onClick={() => onChange(values.filter((_, j) => j !== i))} />
        </span>
      ))}
      <AddButton
        onClick={() => {
          setAdded(true);
          onChange([...values, ""]);
        }}
      >
        {addLabel}
      </AddButton>
    </div>
  );
}

/** One input under each character of the word (furigana, romaji furigana). */
function PerCharInputs({
  word,
  values,
  stored,
  onChange,
  label,
}: {
  word: string;
  values: string[];
  /** As stored, one entry per character: a box that differs is tinted. */
  stored: string[];
  onChange: (next: string[]) => void;
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {Array.from(word).map((char, i) => (
        <label key={i} className="flex w-[4.5rem] flex-col items-center gap-1">
          <span className="text-base font-bold leading-none">{char}</span>
          <input
            value={values[i] ?? ""}
            onChange={(e) => onChange(values.map((v, j) => (j === i ? e.target.value : v)))}
            aria-label={`${label} of ${char} (character ${i + 1})`}
            className={`${INPUT} ${box((values[i] ?? "").trim() !== (stored[i] ?? ""))} w-full px-1.5 py-1 text-center`}
          />
        </label>
      ))}
    </div>
  );
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5 border-t border-border-soft pt-4">
      <h4 className="mb-2.5 text-[0.7rem] font-extrabold uppercase tracking-[1px] text-text-muted">{title}</h4>
      {/* Label beside its value, the same label column in every group; on a phone the label sits above the value. */}
      <dl className="grid grid-cols-1 items-start text-sm sm:grid-cols-[10rem_1fr] sm:gap-x-4 sm:gap-y-2.5">{children}</dl>
    </section>
  );
}

function Field({
  label,
  hint,
  changed = false,
  children,
}: {
  label: string;
  hint?: string;
  /** The value differs from the stored one: the label turns violet, with a dot. */
  changed?: boolean;
  children: ReactNode;
}) {
  return (
    <>
      <dt className={`flex items-center gap-1.5 text-xs sm:pt-1.5 sm:text-sm ${changed ? "text-accent-violet" : "text-text-muted"}`}>
        {label}
        {changed ? (
          <>
            <ChangedDot />
            <span className="sr-only">(changed, not saved)</span>
          </>
        ) : null}
      </dt>
      <dd className="mb-3 min-w-0 last:mb-0 sm:mb-0">
        {children}
        {hint ? <p className="mt-1 text-xs leading-snug text-text-muted">{hint}</p> : null}
      </dd>
    </>
  );
}

interface WordDetailsModalProps {
  candidate: KanjiWordCandidate;
  onClose: () => void;
  /** A save, an undo or a restore changed the word (on both regions). */
  onSaved: (result: VocabularyUpdateResult) => void;
  /** The word was marked as reviewed, or the mark was taken away (on both regions). */
  onReviewed: (result: VocabularyReviewResult) => void;
}

/**
 * Edit one candidate word's dictionary data: its JLPT level, meanings, readings and usage. The word itself is fixed
 * and so is the furigana above it, which only previews the Furigana field. Nothing is written until Save, which
 * writes both regions at once and is refused if the word changed since it was loaded.
 *
 * Every write is logged (vocabulary_edits): right after one, "Undo" takes it back; History lists them all and can go
 * back to any version, the original included. Going back is logged too, so it can be undone as well.
 *
 * "Mark as reviewed" says the word's data has been checked; the mark is the word's (every kanji's list shows it) and
 * "Mark as not reviewed" takes it away. It isn't part of the word's data, so it isn't in the History.
 */
export function WordDetailsModal({ candidate: c, onClose, onSaved, onReviewed }: WordDetailsModalProps) {
  const { showToast } = useToast();
  const [loaded, setLoaded] = useState<KanjiWordVocabulary | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  // As the list had it when the popup opened, then as the last mark / unmark from here left it.
  const [reviewed, setReviewed] = useState<VocabularyReviewMark | null>(c.reviewed ?? null);
  // A write in flight, and which: a save and a review spin their own button; any of them blocks the others.
  const [writing, setWriting] = useState<"save" | "restore" | "review" | null>(null);
  const saving = writing !== null;
  const [saveError, setSaveError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const [view, setView] = useState<"edit" | "history">("edit");
  // The last write made from this popup (a save, an undo, a restore), until the next edit: what "Undo" takes back.
  const [lastWrite, setLastWrite] = useState<{ editId: string; message: string } | null>(null);
  // The History list with the read it came from: a list from before the latest write isn't shown (the placeholder is).
  const [history, setHistory] = useState<{ key: string; edits: VocabularyEdit[] } | null>(null);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [historyTick, setHistoryTick] = useState(0);
  const vocabularyId = loaded?.id ?? null;
  const historyKey = `${vocabularyId}:${historyTick}`;
  const edits = history?.key === historyKey ? history.edits : null;

  // Also runs again from "Try again" and "Load the latest version", which drop the edits.
  useEffect(() => {
    let cancelled = false;
    fetchKanjiWordVocabulary(createClient(), c.id)
      .then((v) => {
        if (cancelled) return;
        setLoaded(v);
        setDraft(toDraft(v));
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
  }, [c.id, reloadTick]);

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
  const stored = loaded ? toValues(toDraft(loaded)) : null;
  const dirty = values !== null && stored !== null && JSON.stringify(values) !== JSON.stringify(stored);
  const changed = (key: keyof VocabularyEditable) =>
    values !== null && stored !== null && JSON.stringify(values[key]) !== JSON.stringify(stored[key]);
  const problems = values ? problemsOf(values) : [];

  function set(patch: Partial<Draft>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
    setSaveError(null);
    setLastWrite(null);
  }

  // A save, an undo and a restore all end the same way: the popup shows what is stored now and can undo it. `done`
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
        onSaved(result);
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
    if (dirty && !window.confirm(`Drop your unsaved changes to ${loaded?.word ?? c.word}?`)) return;
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
      onReviewed(result);
    } catch (err) {
      setSaveError(describeKanjiWordsError(err, "Failed to save."));
    } finally {
      setWriting(null);
    }
  }

  const word = loaded?.word ?? c.word;
  const level = draft ? draft.jlpt_level : c.jlpt;
  const shownProblem = dirty && view === "edit" ? problems[0] : undefined;

  // Portalled: the editor is a GlassCard, whose backdrop-filter would make the Modal's fixed backdrop cover just
  // the card instead of the whole screen.
  return createPortal(
    <Modal
      onClose={onClose}
      labelledBy="word-details-title"
      showCloseButton
      wide
      confirmClose={() => !dirty || window.confirm(`Drop your unsaved changes to ${word}?`)}
    >
      {/* -m-1 p-1: room inside the scroll box for the outline of a changed badge, short meaning or toggle, which
          would be clipped at its edges; the content stays where it was. -mr-7: the box reaches the card's right edge,
          so its scrollbar runs along that edge, clear of the Modal's "x" (16px to 52px in), not under it. pr-13 with
          the scrollbar's room always kept: the content ends 10px left of the "x", so nothing scrolls under it. */}
      <div className="-m-1 -mr-7 max-h-[calc(100dvh-11rem)] overflow-y-auto p-1 pr-13 text-left [scrollbar-gutter:stable]">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {/* The JLPT level, a select dressed as the level badge. */}
          <span
            className={`relative inline-flex items-center rounded-lg border ${levelColorClasses(level)} ${
              changed("jlpt_level") ? CHANGED_OUTLINE : ""
            }`}
          >
            <select
              value={level ?? ""}
              onChange={(e) => set({ jlpt_level: e.target.value || null })}
              disabled={!draft || view === "history"}
              aria-label="JLPT level"
              className="cursor-pointer appearance-none bg-transparent py-1 pl-2.5 pr-6 text-[0.78rem] font-extrabold outline-none disabled:cursor-default md:tracking-[0.5px] [&_option]:bg-gray-900 [&_option]:text-white"
            >
              {LEVELS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
              <option value="">No level</option>
            </select>
            <FaChevronDown className="pointer-events-none absolute right-2 h-2.5 w-2.5" />
          </span>
          {reviewed ? (
            <>
              <span className="inline-flex items-center gap-1 rounded-lg border border-accent-green/30 bg-accent-green/10 px-2 py-1 text-[0.78rem] font-extrabold text-accent-green">
                <FaCircleCheck className="h-3 w-3" />
                Reviewed
              </span>
              <span className="text-xs text-text-muted">
                {reviewed.by ?? "unknown admin"} · {formatWhen(reviewed.at)}
              </span>
            </>
          ) : null}
        </div>
        {/* mt-6: the furigana rides above the heading's own box, so the gap seen under the badge is ~10px less. */}
        <h3 id="word-details-title" className="mt-6 text-[2.2rem] font-bold leading-[1.9]">
          {renderWordWithFurigana(word, draft ? draft.furiganas : c.furiganas, "text-[0.8rem] font-normal text-text-muted")}
        </h3>

        {loadError ? (
          <div className="mt-4 text-sm">
            <p className="text-text-muted">{loadError}</p>
            <button
              type="button"
              onClick={() => {
                setLoadError(null);
                setReloadTick((tick) => tick + 1);
              }}
              className="mt-2 cursor-pointer font-bold text-accent-blue hover:underline"
            >
              Try again
            </button>
          </div>
        ) : null}

        {!draft && !loadError ? (
          <div className="mt-4 space-y-2.5">
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-6 w-1/2" />
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : null}

        {draft && loaded && view === "history" ? (
          <WordHistory
            edits={edits}
            error={historyError}
            onRetry={() => {
              setHistoryError(null);
              setHistoryTick((tick) => tick + 1);
            }}
            current={editableOf(loaded)}
            busy={saving}
            onRestore={(editId, side) =>
              restore(editId, side, side === "before" ? "Restored the original" : "Went back to that version")
            }
          />
        ) : null}

        {draft && stored && view === "edit" ? (
          <>
            {/* The meaning, right under the word, unlabelled: S, then P, then the secondary senses. A line that
                differs from what is stored has its tag tinted, like a field's label. */}
            <div className="mt-1 space-y-2 text-sm">
              <div className="flex items-center gap-1.5">
                <Tag title="Short meaning" className={changed("short_meaning") ? CHANGED_TAG : undefined}>
                  S
                </Tag>
                <input
                  value={draft.short_meaning}
                  onChange={(e) => set({ short_meaning: e.target.value })}
                  placeholder="Short meaning (optional)"
                  aria-label="Short meaning"
                  // On the gold a violet border doesn't read: the outline the level badge gets instead. Its colour is
                  // set even while there is no outline, or transition-colors fades it in from the gold text colour.
                  className={`min-w-0 flex-1 rounded-md border border-accent-gold/30 bg-accent-gold/10 px-2 py-1 font-bold text-accent-gold outline-accent-violet/60 transition-colors placeholder:font-normal placeholder:text-accent-gold/50 focus:border-accent-gold/60 ${
                    changed("short_meaning") ? CHANGED_OUTLINE : "outline-none"
                  }`}
                />
              </div>
              <div className="flex items-start gap-1.5">
                <span className="mt-1.5 flex">
                  <Tag title="Primary meanings" className={changed("primary_meanings") ? CHANGED_TAG : undefined}>
                    P
                  </Tag>
                </span>
                <div className="min-w-0 flex-1">
                  <TextList
                    values={draft.primary_meanings}
                    stored={stored.primary_meanings ?? []}
                    onChange={(next) => set({ primary_meanings: next })}
                    label="Primary meaning"
                    addLabel="Meaning"
                  />
                </div>
              </div>
              <div className="flex items-start gap-1.5">
                <span className="mt-1.5 flex">
                  <Tag title="Secondary meanings" className={changed("other_meanings") ? CHANGED_TAG : undefined}>
                    2nd
                  </Tag>
                </span>
                <div className="min-w-0 flex-1 space-y-1.5">
                  {draft.other_meanings.map((sense, i) => (
                    // A sense that isn't one of the stored senses (new, or edited) is tinted; inside it, so is each
                    // meaning that no stored sense has.
                    <div
                      key={i}
                      className={`flex items-start gap-1.5 rounded-lg border p-1.5 ${
                        tidy(sense).length > 0 &&
                        !(stored.other_meanings ?? []).some((s) => JSON.stringify(s) === JSON.stringify(tidy(sense)))
                          ? "border-accent-violet/50"
                          : "border-border-soft"
                      }`}
                    >
                      <span className="mt-1.5 w-4 shrink-0 text-right text-xs text-text-muted">{i + 1}</span>
                      <div className="min-w-0 flex-1">
                        <TextList
                          values={sense}
                          stored={(stored.other_meanings ?? []).flat()}
                          onChange={(next) =>
                            set({ other_meanings: draft.other_meanings.map((s, j) => (j === i ? next : s)) })
                          }
                          label={`Sense ${i + 1} meaning`}
                          addLabel="Meaning"
                        />
                      </div>
                      <RemoveButton
                        label={`Remove secondary sense ${i + 1}`}
                        onClick={() => set({ other_meanings: draft.other_meanings.filter((_, j) => j !== i) })}
                      />
                    </div>
                  ))}
                  <AddButton onClick={() => set({ other_meanings: [...draft.other_meanings, [""]] })}>Sense</AddButton>
                </div>
              </div>
            </div>

            <Group title="Reading">
              <Field label="Kana reading" changed={changed("kana_reading")}>
                <input
                  value={draft.kana_reading}
                  onChange={(e) => set({ kana_reading: e.target.value })}
                  aria-label="Kana reading"
                  className={`${INPUT} ${box(changed("kana_reading"))} w-full max-w-[18rem]`}
                />
              </Field>
              <Field label="Romaji" changed={changed("romaji_reading")}>
                <input
                  value={draft.romaji_reading}
                  onChange={(e) => set({ romaji_reading: e.target.value })}
                  aria-label="Romaji"
                  className={`${INPUT} ${box(changed("romaji_reading"))} w-full max-w-[18rem]`}
                />
              </Field>
              <Field
                label="Furigana"
                hint="One box per character: empty under kana, “-” when the reading of the character before covers this one too."
                changed={changed("furiganas")}
              >
                <PerCharInputs
                  word={word}
                  values={draft.furiganas}
                  stored={stored.furiganas ?? []}
                  onChange={(next) => set({ furiganas: next })}
                  label="Furigana"
                />
              </Field>
              <Field label="Romaji furigana" changed={changed("romaji_furiganas")}>
                <PerCharInputs
                  word={word}
                  values={draft.romaji_furiganas}
                  stored={stored.romaji_furiganas ?? []}
                  onChange={(next) => set({ romaji_furiganas: next })}
                  label="Romaji furigana"
                />
              </Field>
              <Field label="Other readings" changed={changed("other_readings")}>
                <TextList
                  values={draft.other_readings}
                  stored={stored.other_readings ?? []}
                  onChange={(next) => set({ other_readings: next })}
                  label="Other reading"
                  addLabel="Reading"
                />
              </Field>
            </Group>

            <Group title="Usage">
              <Field label="Parts of speech" changed={changed("parts_of_speech")}>
                <div className="flex flex-wrap items-center gap-1.5">
                  {draft.parts_of_speech.map((pos, i) => (
                    <span
                      key={`${pos}-${i}`}
                      className={`inline-flex max-w-full items-center rounded-lg border pl-2.5 ${box(
                        !(stored.parts_of_speech ?? []).includes(pos)
                      )}`}
                    >
                      <span className="min-w-0 py-1">{pos}</span>
                      <RemoveButton
                        label={`Remove ${pos}`}
                        onClick={() => set({ parts_of_speech: draft.parts_of_speech.filter((_, j) => j !== i) })}
                      />
                    </span>
                  ))}
                  <select
                    value=""
                    onChange={(e) => {
                      if (e.target.value) set({ parts_of_speech: [...draft.parts_of_speech, e.target.value] });
                    }}
                    aria-label="Add a part of speech"
                    className="max-w-full cursor-pointer rounded-lg border border-dashed [field-sizing:content] border-border-soft bg-transparent px-2 py-1 text-xs font-bold text-text-muted outline-none transition-colors hover:border-white/25 hover:text-white focus:border-accent-blue/40 [&_option]:bg-gray-900 [&_option]:font-normal [&_option]:text-white"
                  >
                    <option value="">+ Part of speech</option>
                    {PARTS_OF_SPEECH.filter((pos) => !draft.parts_of_speech.includes(pos)).map((pos) => (
                      <option key={pos} value={pos}>
                        {pos}
                      </option>
                    ))}
                  </select>
                </div>
              </Field>
              <Field label="Common (Jisho)" changed={changed("is_common_jisho")}>
                <Toggle
                  checked={draft.is_common_jisho}
                  onChange={() => set({ is_common_jisho: !draft.is_common_jisho })}
                  color="blue"
                  aria-label="Common (Jisho)"
                  className={`mt-0.5 rounded-full ${changed("is_common_jisho") ? CHANGED_OUTLINE : ""}`}
                />
              </Field>
              <Field label="Usually written in kana" changed={changed("usually_kana")}>
                <Toggle
                  checked={draft.usually_kana}
                  onChange={() => set({ usually_kana: !draft.usually_kana })}
                  color="blue"
                  aria-label="Usually written in kana"
                  className={`mt-0.5 rounded-full ${changed("usually_kana") ? CHANGED_OUTLINE : ""}`}
                />
              </Field>
              <Field
                label="Enabled for study"
                hint={
                  draft.study_enabled
                    ? undefined
                    : "Not enabled: no student gets a new card for it, and it can't be chosen for any kanji."
                }
                changed={changed("study_enabled")}
              >
                <Toggle
                  checked={draft.study_enabled}
                  onChange={() => set({ study_enabled: !draft.study_enabled })}
                  color="blue"
                  aria-label="Enabled for study"
                  className={`mt-0.5 rounded-full ${changed("study_enabled") ? CHANGED_OUTLINE : ""}`}
                />
              </Field>
            </Group>
          </>
        ) : null}
      </div>

      {draft ? (
        <div className="mt-4 flex flex-wrap items-center justify-end gap-x-3 gap-y-2 border-t border-border-soft pt-4">
          <div className="mr-auto flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <button
              type="button"
              onClick={() => setView((v) => (v === "edit" ? "history" : "edit"))}
              className="cursor-pointer font-bold text-accent-blue hover:underline"
            >
              {view === "edit" ? "History" : "Back to the word"}
            </button>
            {saveError || shownProblem ? (
              <div role="alert" className="min-w-0 text-accent-red">
                <p>{saveError ?? shownProblem}</p>
                {conflict ? (
                  <button
                    type="button"
                    onClick={() => setReloadTick((tick) => tick + 1)}
                    className="mt-1 cursor-pointer font-bold text-accent-blue hover:underline"
                  >
                    Load the latest version (drops your changes)
                  </button>
                ) : null}
              </div>
            ) : lastWrite ? (
              <span className="text-text-muted">
                {lastWrite.message}{" "}
                {/* Undoing an undo puts the change back, so it reads "Redo" then. */}
                <button
                  type="button"
                  onClick={() =>
                    restore(lastWrite.editId, "before", lastWrite.message === "Undone." ? "Redone" : "Undone")
                  }
                  disabled={saving}
                  className="cursor-pointer font-bold text-accent-blue hover:underline disabled:cursor-default disabled:opacity-50"
                >
                  {lastWrite.message === "Undone." ? "Redo" : "Undo"}
                </button>
              </span>
            ) : null}
          </div>
          {view === "edit" ? (
            reviewed ? (
              <Button size="sm" variant="secondary" onClick={() => void markReviewed(false)} loading={writing === "review"} disabled={saving}>
                Mark as not reviewed
              </Button>
            ) : (
              // Reviewed means "the data as stored is right", so unsaved edits go first.
              <Button
                size="sm"
                variant="secondary"
                onClick={() => void markReviewed(true)}
                loading={writing === "review"}
                disabled={saving || dirty}
                title={dirty ? "Save or discard your changes first" : undefined}
                className="!border-accent-green/30 !bg-accent-green/10 !text-accent-green enabled:hover:!border-accent-green/50 enabled:hover:!bg-accent-green/[0.16]"
              >
                <FaCircleCheck className="h-3.5 w-3.5" />
                Mark as reviewed
              </Button>
            )
          ) : null}
          {view === "edit" && dirty ? (
            <Button size="sm" variant="secondary" onClick={() => loaded && setDraft(toDraft(loaded))} disabled={saving}>
              Discard changes
            </Button>
          ) : null}
          {view === "edit" ? (
            <Button
              size="sm"
              onClick={save}
              loading={writing === "save"}
              disabled={saving || !dirty || problems.length > 0}
            >
              Save
            </Button>
          ) : null}
        </div>
      ) : null}
    </Modal>,
    document.body
  );
}
