"use client";

import { Fragment, type ReactNode } from "react";
import { FaChevronDown, FaCircleCheck } from "react-icons/fa6";
import { renderWordWithFurigana } from "@/lib/study/furigana";
import { Button } from "@/app/components/ui/Button";
import { levelColorClasses } from "@/app/components/ui/LevelBadge";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { Toggle } from "@/app/components/ui/Toggle";
import { blankItem } from "./meaningsDraft";
import { MeaningsEditor } from "./MeaningsEditor";
import { editableOf, type WordEditorState } from "./useWordEditor";
import { box, CHANGED_OUTLINE, ChangedDot, DragDock, Grip, Placeholder, RemoveButton, TextList } from "./wordEditorParts";
import { formatWhen, PARTS_OF_SPEECH } from "./wordLabels";
import { WordHistory } from "./WordHistory";

/*
 * The word editor's pieces, shared by the popup on /admin/kanji-words (WordDetailsModal, one column) and the word
 * page of /admin/words (two columns on a wide screen). Each takes the state from useWordEditor.
 */

const LEVELS = ["N5", "N4", "N3", "N2", "N1"];

const INPUT =
  "rounded-lg border px-2.5 py-1.5 text-sm text-white outline-none transition-colors placeholder:text-text-muted/60 focus:border-accent-blue/40";

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

function Group({ title, className = "", children }: { title: string; className?: string; children: ReactNode }) {
  return (
    <section className={`mt-5 border-t border-border-soft pt-4 ${className}`}>
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

/** Shown while the word loads (or if it couldn't): what is known of it already. */
export interface WordFallback {
  word: string;
  furiganas: string[] | null;
  jlpt: string | null;
}

/** The JLPT level (a select dressed as the level badge), the reviewed mark, and the word with its furigana. */
export function WordHeading({
  editor: e,
  fallback,
  id,
  as: Heading = "h3",
}: {
  editor: WordEditorState;
  /** null: nothing known yet, a placeholder until the word loads. */
  fallback: WordFallback | null;
  id: string;
  as?: "h1" | "h3";
}) {
  const { draft, loaded, reviewed } = e;
  const word = loaded?.word ?? fallback?.word ?? null;
  const level = draft ? draft.jlpt_level : (fallback?.jlpt ?? null);
  // A word that couldn't be loaded and isn't known otherwise (a wrong id on the word page): no level to show.
  const known = draft !== null || fallback !== null || !e.loadError;
  return (
    <>
      <div className={`flex flex-wrap items-center gap-x-2 gap-y-1.5 ${known ? "" : "hidden"}`}>
        <span
          className={`relative inline-flex items-center rounded-lg border ${levelColorClasses(level)} ${
            e.changed("jlpt_level") ? CHANGED_OUTLINE : ""
          }`}
        >
          <select
            value={level ?? ""}
            onChange={(ev) => e.set({ jlpt_level: ev.target.value || null })}
            disabled={!draft || e.view === "history"}
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
      <Heading id={id} className="mt-6 text-[2.2rem] font-bold leading-[1.9]">
        {word !== null ? (
          renderWordWithFurigana(word, draft ? draft.furiganas : (fallback?.furiganas ?? null), "text-[0.8rem] font-normal text-text-muted")
        ) : e.loadError ? null : (
          <Skeleton className="h-12 w-40" />
        )}
      </Heading>
    </>
  );
}

/** The load failed (with "Try again"), or the placeholder while it runs. */
export function WordLoadState({ editor: e }: { editor: WordEditorState }) {
  if (e.loadError) {
    return (
      <div className="mt-4 text-sm">
        <p className="text-text-muted">{e.loadError}</p>
        <button type="button" onClick={e.retryLoad} className="mt-2 cursor-pointer font-bold text-accent-blue hover:underline">
          Try again
        </button>
      </div>
    );
  }
  if (e.draft) return null;
  return (
    <div className="mt-4 space-y-2.5">
      <Skeleton className="h-6 w-2/3" />
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-4 w-3/5" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

/** S, P and the secondary senses, right under the word. */
export function WordMeaningsFields({ editor: e }: { editor: WordEditorState }) {
  if (!e.draft || !e.stored || e.view !== "edit") return null;
  return (
    <MeaningsEditor lists={e.draft} stored={e.stored} changed={e.changed} onChange={e.set} drag={e.drag} startDrag={e.startDrag} />
  );
}

/** Kana reading, romaji, furigana, romaji furigana, other readings. `className` goes on the group (on the page's
 *  right column it starts at the top, with no line above). */
export function WordReadingGroup({ editor: e, className }: { editor: WordEditorState; className?: string }) {
  const { draft, stored, changed, set, drag, startDrag, movedItem, ringOf, loaded } = e;
  if (!draft || !stored || !loaded || e.view !== "edit") return null;
  return (
    <Group title="Reading" className={className}>
      <Field label="Kana reading" changed={changed("kana_reading")}>
        <input
          value={draft.kana_reading}
          onChange={(ev) => set({ kana_reading: ev.target.value })}
          aria-label="Kana reading"
          className={`${INPUT} ${box(changed("kana_reading"))} w-full max-w-[18rem]`}
        />
      </Field>
      <Field label="Romaji" changed={changed("romaji_reading")}>
        <input
          value={draft.romaji_reading}
          onChange={(ev) => set({ romaji_reading: ev.target.value })}
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
          word={loaded.word}
          values={draft.furiganas}
          stored={stored.furiganas ?? []}
          onChange={(next) => set({ furiganas: next })}
          label="Furigana"
        />
      </Field>
      <Field label="Romaji furigana" changed={changed("romaji_furiganas")}>
        <PerCharInputs
          word={loaded.word}
          values={draft.romaji_furiganas}
          stored={stored.romaji_furiganas ?? []}
          onChange={(next) => set({ romaji_furiganas: next })}
          label="Romaji furigana"
        />
      </Field>
      <Field label="Other readings" changed={changed("other_readings")}>
        <div data-dnd-zone="R" className={`rounded-lg ${ringOf("R")}`}>
          <TextList
            items={draft.other_readings}
            stored={stored.other_readings ?? []}
            onChange={(next) => set({ other_readings: next })}
            label="Other reading"
            addLabel="Reading"
            dnd={{ list: "R", s: 0, drag, startDrag, moved: movedItem }}
          />
        </div>
      </Field>
    </Group>
  );
}

/** Parts of speech and the three switches. */
export function WordUsageGroup({ editor: e }: { editor: WordEditorState }) {
  const { draft, stored, changed, set, drag, startDrag, movedItem, ringOf, posPlaceholder } = e;
  if (!draft || !stored || e.view !== "edit") return null;
  const placeholder = drag ? <Placeholder width={drag.width} height={drag.height} /> : null;
  return (
    <Group title="Usage">
      <Field label="Parts of speech" changed={changed("parts_of_speech")}>
        <div data-dnd-zone="POS" data-dnd-list="POS" className={`flex flex-wrap items-center gap-1.5 rounded-lg ${ringOf("POS")}`}>
          {draft.parts_of_speech.map((pos, i) => (
            <Fragment key={pos.id}>
              {posPlaceholder === i ? placeholder : null}
              <span
                data-dnd-key={pos.id}
                data-dnd-item=""
                data-dnd-idx={i}
                className={`inline-flex max-w-full items-center rounded-lg border ${box(
                  !(stored.parts_of_speech ?? []).includes(pos.text) || movedItem(pos)
                )} ${drag?.src.id === pos.id ? "hidden" : ""}`}
              >
                <Grip onPointerDown={(ev) => startDrag(ev, { type: "item", id: pos.id, loc: { list: "POS", s: 0, i } })} />
                <span className="min-w-0 py-1 pl-0.5">{pos.text}</span>
                <RemoveButton
                  label={`Remove ${pos.text}`}
                  onClick={() => set({ parts_of_speech: draft.parts_of_speech.filter((other) => other.id !== pos.id) })}
                />
              </span>
            </Fragment>
          ))}
          {posPlaceholder === draft.parts_of_speech.length ? placeholder : null}
          <select
            value=""
            onChange={(ev) => {
              if (ev.target.value) set({ parts_of_speech: [...draft.parts_of_speech, blankItem(ev.target.value)] });
            }}
            aria-label="Add a part of speech"
            className="max-w-full cursor-pointer rounded-lg border border-dashed [field-sizing:content] border-border-soft bg-transparent px-2 py-1 text-xs font-bold text-text-muted outline-none transition-colors hover:border-white/25 hover:text-white focus:border-accent-blue/40 [&_option]:bg-gray-900 [&_option]:font-normal [&_option]:text-white"
          >
            <option value="">+ Part of speech</option>
            {PARTS_OF_SPEECH.filter((pos) => !draft.parts_of_speech.some((item) => item.text === pos)).map((pos) => (
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
        hint={draft.study_enabled ? undefined : "Not enabled: no student gets a new card for it, and it can't be chosen for any kanji."}
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
  );
}

/** Every logged change of the word, with "Go back to this version" and "Restore the original". */
export function WordHistoryView({ editor: e }: { editor: WordEditorState }) {
  if (!e.draft || !e.loaded || e.view !== "history") return null;
  return (
    <WordHistory
      edits={e.edits}
      error={e.historyError}
      onRetry={e.retryHistory}
      current={editableOf(e.loaded)}
      busy={e.saving}
      onRestore={(editId, side) => e.restore(editId, side, side === "before" ? "Restored the original" : "Went back to that version")}
    />
  );
}

/** While a meaning or a sense is dragged and S and P are scrolled out of view: drop targets for them
 *  (`dockClassName` places them), and what the last drag did, for screen readers. */
export function WordDragExtras({ editor: e, dockClassName }: { editor: WordEditorState; dockClassName?: string }) {
  return (
    <>
      {e.drag?.dock ? <DragDock drag={e.drag} className={dockClassName} /> : null}
      <p className="sr-only" aria-live="polite">
        {e.announcement}
      </p>
    </>
  );
}

/** History / Back to the word, the error or "Undo", the reviewed button, Discard and Save. */
export function WordFooter({ editor: e, className = "" }: { editor: WordEditorState; className?: string }) {
  const { view, saving, writing, dirty, reviewed, lastWrite } = e;
  if (!e.draft) return null;
  return (
    <div className={`flex flex-wrap items-center justify-end gap-x-3 gap-y-2 ${className}`}>
      <div className="mr-auto flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1 text-sm">
        <button type="button" onClick={e.toggleView} className="cursor-pointer font-bold text-accent-blue hover:underline">
          {view === "edit" ? "History" : "Back to the word"}
        </button>
        {e.saveError || e.shownProblem ? (
          <div role="alert" className="min-w-0 text-accent-red">
            <p>{e.saveError ?? e.shownProblem}</p>
            {e.conflict ? (
              <button type="button" onClick={e.reloadLatest} className="mt-1 cursor-pointer font-bold text-accent-blue hover:underline">
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
              onClick={() => e.restore(lastWrite.editId, "before", lastWrite.message === "Undone." ? "Redone" : "Undone")}
              disabled={saving}
              className="cursor-pointer font-bold text-accent-blue hover:underline disabled:cursor-default disabled:opacity-50"
            >
              {lastWrite.message === "Undone." ? "Redo" : "Undo"}
            </button>
          </span>
        ) : null}
      </div>
      {/* undefined: the mark couldn't be read, so there is nothing to show it against. */}
      {view === "edit" && reviewed !== undefined ? (
        reviewed ? (
          <Button size="sm" variant="secondary" onClick={() => void e.markReviewed(false)} loading={writing === "review"} disabled={saving}>
            Mark as not reviewed
          </Button>
        ) : (
          // Reviewed means "the data as stored is right", so unsaved edits go first.
          <Button
            size="sm"
            variant="secondary"
            onClick={() => void e.markReviewed(true)}
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
        <Button size="sm" variant="secondary" onClick={e.discard} disabled={saving}>
          Discard changes
        </Button>
      ) : null}
      {view === "edit" ? (
        <Button size="sm" onClick={e.save} loading={writing === "save"} disabled={saving || !dirty || e.problems.length > 0}>
          Save
        </Button>
      ) : null}
    </div>
  );
}
