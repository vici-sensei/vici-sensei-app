import type {
  KanjiWordCandidate,
  KanjiWordsBatch,
  KanjiWordsBulkResult,
  KanjiWordsHistoryVersion,
} from "@/lib/types";

/** Colour of a level-gap pill: how far above the kanji's own level the word sits. A word with no JLPT level
 *  counts as beyond N1 (rank 6), exactly like the algorithm treats it, so it shows up here too. */
export function gapToneClasses(gap: number): string {
  if (gap >= 2) return "border-accent-red/30 bg-accent-red/10 text-accent-red";
  if (gap === 1) return "border-accent-orange/30 bg-accent-orange/10 text-accent-orange";
  return "border-border-soft bg-white/5 text-text-muted";
}

export function gapText(gap: number): string {
  if (gap > 0) return `+${gap}`;
  if (gap < 0) return String(gap);
  return "=";
}

/** The sentence under a candidate: why the algorithm did or didn't pick it. */
export function algoReason(c: KanjiWordCandidate): string {
  if (!c.enabled) return "Not enabled for study, so it can't be in a list.";
  const info = c.info;
  if (!info) return "";
  if (info.pick_kind === "champion") return `Picked by the algorithm: the best word of reading group ${c.rg}.`;
  if (info.pick_kind === "fill_in") {
    return "Picked by the algorithm to fill the list: this kanji has fewer than 3 reading groups.";
  }
  if (!info.in_class) {
    return info.cand_class === 1
      ? "Skipped: its reading belongs to the whole word (shared furigana), and this kanji has better words."
      : "Skipped: it is usually written in kana, and this kanji has better words.";
  }
  if (info.dup_of !== null) return "Skipped: another entry for the same word was kept instead.";
  if (info.group_selected === false) {
    const size = info.group_size ?? 0;
    const needs =
      info.cand_class === 0
        ? "a reading group needs 2+ words or to be one of the 3 largest"
        : "only the 3 largest reading groups count";
    return `Skipped: reading group ${c.rg} (${size} word${size === 1 ? "" : "s"}) is too small; ${needs}.`;
  }
  return info.champion_word
    ? `Skipped: ${info.champion_word} was chosen for this reading group (better level fit, commonness or frequency).`
    : "Skipped: another word was chosen for this reading group.";
}

function detailOp(detail: Record<string, unknown> | null): { op: string | null; params: Record<string, unknown> } {
  const op = typeof detail?.op === "string" ? detail.op : null;
  const params = (detail?.params ?? {}) as Record<string, unknown>;
  return { op, params };
}

type Labelled = Pick<KanjiWordsHistoryVersion | KanjiWordsBatch, "kind" | "detail"> & { reviewed?: boolean };

/** One line for a history row or a batch. */
export function historyKindLabel(entry: Labelled): string {
  const { op, params } = detailOp(entry.detail);
  switch (entry.kind) {
    case "save":
      return "Saved";
    case "reset":
      return "Reset to the algorithm's list";
    case "review":
      return params.reviewed === false || (op === null && entry.reviewed === false)
        ? "Marked as not reviewed"
        : "Marked as reviewed";
    case "bulk":
      return op === "remove_gap"
        ? `Removed words ${String(params.min_gap ?? 2)}+ levels above the kanji`
        : "Bulk change";
    case "restore":
      return `Restored version ${String(entry.detail?.restored_version ?? "?")}`;
    case "undo_batch":
      return "Undid a bulk change";
    case "restore_all":
      return "Restored every kanji to an earlier moment";
    case "algo_changed":
      return "The algorithm's result changed";
  }
}

/** The preview / outcome of a bulk operation, as lines of text. */
export function describeBulkResult(result: KanjiWordsBulkResult): string[] {
  const lines: string[] = [];
  const kanji = (n: number) => `${n} kanji`;
  if (result.changed === 0) lines.push(result.dry_run ? "Nothing would change." : "Nothing changed.");
  else lines.push(result.dry_run ? `${kanji(result.changed)} will change.` : `${kanji(result.changed)} changed.`);
  if (result.changed > 0) {
    const parts = [];
    if (result.words_removed > 0) parts.push(`${result.words_removed} word${result.words_removed === 1 ? "" : "s"} removed`);
    if (result.words_added > 0) parts.push(`${result.words_added} word${result.words_added === 1 ? "" : "s"} added`);
    if (parts.length > 0) lines.push(parts.join(", ") + ".");
  }
  if (result.unchanged > 0) lines.push(`${kanji(result.unchanged)} already in that state.`);
  if (result.conflicts.length > 0) {
    lines.push(`${kanji(result.conflicts.length)} changed since this page loaded them and will be skipped.`);
  }
  if (result.skipped_changed_since) {
    lines.push(`${kanji(result.skipped_changed_since)} edited after this batch will be left alone.`);
  }
  return lines;
}

export const dateTimeFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export function formatWhen(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}
