"use client";

import { Skeleton } from "@/app/components/ui/Skeleton";
import type { VocabularyEdit, VocabularyEditable } from "@/lib/types";
import { formatWhen } from "./wordLabels";

// The editable columns in the popup's order, with the popup's labels.
const FIELDS: [key: keyof VocabularyEditable, label: string][] = [
  ["jlpt_level", "JLPT level"],
  ["short_meaning", "Short meaning"],
  ["primary_meanings", "Primary meanings"],
  ["other_meanings", "Secondary meanings"],
  ["kana_reading", "Kana reading"],
  ["romaji_reading", "Romaji"],
  ["furiganas", "Furigana"],
  ["romaji_furiganas", "Romaji furigana"],
  ["other_readings", "Other readings"],
  ["parts_of_speech", "Parts of speech"],
  ["is_common_jisho", "Common (Jisho)"],
  ["usually_kana", "Usually written in kana"],
  ["study_enabled", "Enabled for study"],
];

function formatValue(key: keyof VocabularyEditable, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (key === "other_meanings" && Array.isArray(value)) {
    return (value as string[][]).map((sense) => sense.join(", ")).join(" · ") || "—";
  }
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return value.join(key === "furiganas" || key === "romaji_furiganas" ? " · " : ", ");
  }
  return String(value);
}

const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Two states of a word hold the same values (key order and null vs missing don't matter). */
export function sameState(a: VocabularyEditable, b: VocabularyEditable): boolean {
  return FIELDS.every(([key]) => same(a[key], b[key]));
}

function Changes({ edit }: { edit: VocabularyEdit }) {
  const changed = FIELDS.filter(([key]) => !same(edit.before[key], edit.after[key]));
  if (changed.length === 0) return <p className="mt-2 text-sm italic text-text-muted">No visible change.</p>;
  return (
    <ul className="mt-2 space-y-1 text-sm">
      {changed.map(([key, label]) => (
        <li key={key} className="break-words">
          <span className="text-text-muted">{label}: </span>
          <span className="text-text-muted line-through decoration-white/30">{formatValue(key, edit.before[key])}</span>
          <span className="text-text-muted"> → </span>
          <span>{formatValue(key, edit.after[key])}</span>
        </li>
      ))}
    </ul>
  );
}

function RestoreButton({ busy, onClick, children }: { busy: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="shrink-0 cursor-pointer rounded-lg border border-border-soft px-2.5 py-1 text-xs font-bold text-text-muted transition-colors hover:border-white/25 hover:text-white disabled:cursor-default disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function CurrentMark() {
  return <span className="shrink-0 text-xs font-bold text-accent-blue">Current</span>;
}

interface WordHistoryProps {
  /** Newest first; null while loading. */
  edits: VocabularyEdit[] | null;
  error: string | null;
  onRetry: () => void;
  /** The word as it is stored now, to mark the version it matches as current. */
  current: VocabularyEditable;
  busy: boolean;
  /** Put the word back as it was before or after one change. */
  onRestore: (editId: string, side: "before" | "after") => void;
}

/**
 * Every change made to a word from its popup, newest first, each with what it changed and a button to go back to the
 * word as it was right after it; at the bottom, the original (before the first change). Going back is a change too,
 * listed here, so it can be undone as well.
 */
export function WordHistory({ edits, error, onRetry, current, busy, onRestore }: WordHistoryProps) {
  if (error) {
    return (
      <div className="mt-4 text-sm">
        <p className="text-text-muted">{error}</p>
        <button type="button" onClick={onRetry} className="mt-2 cursor-pointer font-bold text-accent-blue hover:underline">
          Try again
        </button>
      </div>
    );
  }
  if (!edits) {
    return (
      <div className="mt-4 space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  if (edits.length === 0) {
    return (
      <p className="mt-4 text-sm italic text-text-muted">
        No changes yet. Every save made here is listed, and any of them can be undone.
      </p>
    );
  }

  const byId = new Map(edits.map((edit) => [edit.id, edit]));
  const title = (edit: VocabularyEdit) => {
    if (edit.kind === "edit") return "Edited";
    const target = edit.restored_from ? byId.get(edit.restored_from) : undefined;
    const when = target ? formatWhen(target.created_at) : "an earlier change";
    return edit.restored_side === "before" ? `Undid the change of ${when}` : `Went back to the version of ${when}`;
  };
  const oldest = edits[edits.length - 1];

  return (
    <ul className="mt-4 space-y-2">
      {edits.map((edit) => (
        <li key={edit.id} className="rounded-xl border border-border-soft bg-white/[0.02] p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-bold">{title(edit)}</div>
              <div className="text-xs text-text-muted">
                {formatWhen(edit.created_at)} · {edit.admin_email ?? "unknown admin"}
              </div>
            </div>
            {sameState(edit.after, current) ? (
              <CurrentMark />
            ) : (
              <RestoreButton busy={busy} onClick={() => onRestore(edit.id, "after")}>
                Go back to this version
              </RestoreButton>
            )}
          </div>
          <Changes edit={edit} />
        </li>
      ))}
      <li className="rounded-xl border border-dashed border-border-soft p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="font-bold">Original</div>
            <div className="text-xs text-text-muted">As it was before the first change made here.</div>
          </div>
          {sameState(oldest.before, current) ? (
            <CurrentMark />
          ) : (
            <RestoreButton busy={busy} onClick={() => onRestore(oldest.id, "before")}>
              Restore the original
            </RestoreButton>
          )}
        </div>
      </li>
    </ul>
  );
}
