import type { AppSupabaseClient } from "@/lib/supabase/types";
import type {
  KanjiWordCandidates,
  KanjiWordVocabulary,
  KanjiWordsBatch,
  KanjiWordsBulkOp,
  KanjiWordsBulkResult,
  KanjiWordsHistory,
  KanjiWordsMeaningsMap,
  KanjiWordsOverview,
  KanjiWordsParity,
  KanjiWordsTodoCount,
  VocabularyEdit,
  VocabularyEditable,
  VocabularyReviewResult,
  VocabularyReviewRow,
  VocabularyUpdateResult,
} from "@/lib/types";

/**
 * Client side of the admin RPCs from 20261007064452_kanji_words_admin_rpcs.sql. They only exist on the
 * EU/US projects (the old project this app talks to with NEXT_PUBLIC_MULTI_REGION off has none of them),
 * so callers gate the page on isMultiRegionEnabled(). Every RPC returns a single jsonb document.
 *
 * Every write is applied on the admin's own region AND pushed to the other one in the same
 * transaction; a failed push fails the call, nothing stays half-written.
 */

/** The message a failed RPC carries -- the RPCs raise these exact strings. */
export type KanjiWordsErrorCode =
  | "kanji_words_conflict"
  | "kanji_words_invalid_word"
  | "kanji_words_duplicate_word"
  | "kanji_words_remote_missing";

export class KanjiWordsError extends Error {
  code: string | undefined;
  /** The RPC's DETAIL: for vocabulary_invalid, the sentence saying what is wrong. */
  details: string | undefined;

  constructor(message: string, code?: string, details?: string) {
    super(message);
    this.name = "KanjiWordsError";
    this.code = code;
    this.details = details || undefined;
  }
}

/** The word changed (on either region) since the popup loaded it. */
export function isVocabularyConflict(err: unknown): boolean {
  return err instanceof KanjiWordsError && err.message === "vocabulary_conflict";
}

/** The kanji changed (on either region) since the page loaded it: SQLSTATE 40001 / "kanji_words_conflict". */
export function isKanjiWordsConflict(err: unknown): boolean {
  return err instanceof KanjiWordsError && (err.message === "kanji_words_conflict" || err.code === "40001");
}

/** A readable sentence for an error from any of the RPCs below. */
export function describeKanjiWordsError(err: unknown, fallback: string): string {
  const message = err instanceof Error ? err.message : "";
  switch (message) {
    case "kanji_words_conflict":
      return "This kanji was changed by someone else (or on the other region) in the meantime.";
    case "kanji_words_invalid_word":
      return "One of the chosen words doesn't belong to this kanji or isn't enabled for study.";
    case "kanji_words_duplicate_word":
      return "Two of the chosen entries are the same word. Keep only one of them.";
    case "kanji_words_remote_missing":
      return "The other region isn't linked yet, so nothing can be saved.";
    case "vocabulary_conflict":
      return "This word was changed by someone else (or on the other region) since you opened it.";
    case "vocabulary_invalid":
      return (err instanceof KanjiWordsError && err.details) || "Some of the values aren't valid.";
    case "vocabulary_unknown":
      return "This word is no longer in the dictionary.";
    case "vocabulary_unknown_version":
      return "That version isn't in this word's history.";
    case "vocabulary_remote_missing":
      return "The other region isn't linked for word edits yet, so nothing can be saved.";
    case "Not authorized":
      return "Only teachers can edit kanji words.";
    default:
      return message || fallback;
  }
}

async function call<T>(supabase: AppSupabaseClient, fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new KanjiWordsError(error.message, error.code, error.details);
  return data as T;
}

export function fetchKanjiWordsOverview(supabase: AppSupabaseClient): Promise<KanjiWordsOverview> {
  return call(supabase, "admin_get_kanji_words_overview");
}

/** The meanings of the words in the kanji lists: `kanjiWordIds` null = every word of every final or algorithm
 *  list (~570 KB), an array = just those words. */
export function fetchKanjiWordsMeanings(
  supabase: AppSupabaseClient,
  kanjiWordIds: number[] | null
): Promise<KanjiWordsMeaningsMap> {
  return call(supabase, "admin_get_kanji_words_meanings", { p_kanji_word_ids: kanjiWordIds });
}

export function fetchKanjiWordCandidates(supabase: AppSupabaseClient, kanjiId: number): Promise<KanjiWordCandidates> {
  return call(supabase, "admin_get_kanji_word_candidates", { p_kanji_id: kanjiId });
}

const VOCABULARY_COLUMNS =
  "id, word, kana_reading, romaji_reading, furiganas, romaji_furiganas, other_readings, short_meaning, primary_meanings, other_meanings, parts_of_speech, jlpt_level, is_common_jisho, usually_kana, study_enabled";

/**
 * The dictionary row of one candidate's word (a kanji_word id), for the word details popup. A plain table read
 * (both tables are readable by any signed-in user), so no RPC is needed and it works the same on both regions.
 */
export async function fetchKanjiWordVocabulary(
  supabase: AppSupabaseClient,
  kanjiWordId: number
): Promise<KanjiWordVocabulary> {
  const { data, error } = await supabase
    .from("kanji_word")
    .select(`vocabulary:id_word(${VOCABULARY_COLUMNS})`)
    .eq("id", kanjiWordId)
    .maybeSingle();
  if (error) throw new KanjiWordsError(error.message, error.code);
  const vocabulary = (data as unknown as { vocabulary: KanjiWordVocabulary | null } | null)?.vocabulary ?? null;
  if (!vocabulary) throw new KanjiWordsError("This word is no longer in the dictionary.");
  return vocabulary;
}

/** The same row by its vocabulary id, for the word page of /admin/words (a word without kanji has no kanji_word). */
export async function fetchVocabulary(supabase: AppSupabaseClient, vocabularyId: number): Promise<KanjiWordVocabulary> {
  const { data, error } = await supabase.from("vocabulary").select(VOCABULARY_COLUMNS).eq("id", vocabularyId).maybeSingle();
  if (error) throw new KanjiWordsError(error.message, error.code);
  if (!data) throw new KanjiWordsError("This word is no longer in the dictionary.");
  return data as unknown as KanjiWordVocabulary;
}

/** The reviewed marks of those words, or of every marked word when `vocabularyIds` is null
 *  (20261017023044_vocabulary_reviews_read.sql). A word with no mark isn't in the list. */
export function fetchVocabularyReviews(
  supabase: AppSupabaseClient,
  vocabularyIds: number[] | null
): Promise<VocabularyReviewRow[]> {
  return call(supabase, "admin_get_vocabulary_reviews", { p_vocabulary_ids: vocabularyIds });
}

/**
 * Save one word's dictionary data (20261015011213_vocabulary_admin_edit.sql): on the admin's region and the other
 * one in the same transaction, with a log row on both (vocabulary_edits, append-only). `expected` is the row as the popup loaded it; if either
 * region holds something else now, it is refused with vocabulary_conflict and nothing is written.
 */
export function updateVocabulary(
  supabase: AppSupabaseClient,
  args: { vocabularyId: number; expected: VocabularyEditable; values: VocabularyEditable }
): Promise<VocabularyUpdateResult> {
  return call(supabase, "admin_update_vocabulary", {
    p_vocabulary_id: args.vocabularyId,
    p_expected: args.expected,
    p_values: args.values,
  });
}

/** Put a word back as it was before ("before": an undo of that change) or after one of its logged changes. Logged
 *  too, so it can be undone in turn; refused like a save when the word changed since `expected` was loaded. */
export function restoreVocabulary(
  supabase: AppSupabaseClient,
  args: { vocabularyId: number; expected: VocabularyEditable; editId: string; side: "before" | "after" }
): Promise<VocabularyUpdateResult> {
  return call(supabase, "admin_restore_vocabulary", {
    p_vocabulary_id: args.vocabularyId,
    p_expected: args.expected,
    p_edit_id: args.editId,
    p_side: args.side,
  });
}

/** Mark one word as reviewed (its dictionary data was checked), or take the mark away, on both regions at once
 *  (20261015200558_vocabulary_review_mark.sql). Marking a word already marked keeps the first mark. */
export function setVocabularyReviewed(
  supabase: AppSupabaseClient,
  args: { vocabularyId: number; reviewed: boolean }
): Promise<VocabularyReviewResult> {
  return call(supabase, "admin_set_vocabulary_reviewed", {
    p_vocabulary_id: args.vocabularyId,
    p_reviewed: args.reviewed,
  });
}

/** Every logged change of one word, newest first. */
export function fetchVocabularyEdits(supabase: AppSupabaseClient, vocabularyId: number): Promise<VocabularyEdit[]> {
  return call(supabase, "admin_get_vocabulary_edits", { p_vocabulary_id: vocabularyId });
}

export function fetchKanjiWordsHistory(supabase: AppSupabaseClient, kanjiId: number): Promise<KanjiWordsHistory> {
  return call(supabase, "admin_get_kanji_words_history", { p_kanji_id: kanjiId });
}

export function fetchKanjiWordsBatches(supabase: AppSupabaseClient, limit = 30): Promise<KanjiWordsBatch[]> {
  return call(supabase, "admin_get_kanji_words_batches", { p_limit: limit });
}

export function fetchKanjiWordsTodoCount(supabase: AppSupabaseClient): Promise<KanjiWordsTodoCount> {
  return call(supabase, "admin_get_kanji_words_todo_count");
}

export function fetchKanjiWordsParity(supabase: AppSupabaseClient): Promise<KanjiWordsParity> {
  return call(supabase, "admin_kanji_words_parity");
}

/**
 * Save one kanji: `wordIds` is the COMPLETE list wanted (kanji_word ids). The reviewed mark is left as it is
 * (it has its own RPC, setKanjiReviewed). Resolves with the new version, or the old one with `changed: false`
 * when nothing differed (no history row is written then).
 */
export function saveKanjiWords(
  supabase: AppSupabaseClient,
  args: { kanjiId: number; wordIds: number[]; expectedVersion: number; note: string | null }
): Promise<{ kanji_id: number; changed: boolean; version: number }> {
  return call(supabase, "admin_save_kanji_words", {
    p_kanji_id: args.kanjiId,
    p_word_ids: args.wordIds,
    p_expected_version: args.expectedVersion,
    p_note: args.note,
    // Sent explicitly: left out, the RPC's default (true) would mark the kanji reviewed.
    p_reviewed: null,
  });
}

/**
 * Mark one kanji as reviewed, or take the mark away, right now (20261016020152_kanji_words_set_reviewed.sql). Its
 * words stay exactly as saved; a draft not saved yet isn't touched. A new version with a "review" history row, on
 * both regions; refused with kanji_words_conflict when the kanji moved past `expectedVersion`.
 */
export function setKanjiReviewed(
  supabase: AppSupabaseClient,
  args: { kanjiId: number; reviewed: boolean; expectedVersion: number }
): Promise<{ kanji_id: number; changed: boolean; version: number; reviewed: boolean }> {
  return call(supabase, "admin_set_kanji_reviewed", {
    p_kanji_id: args.kanjiId,
    p_reviewed: args.reviewed,
    p_expected_version: args.expectedVersion,
  });
}

/** Put one kanji back in the state of an earlier version (0 = untouched). It becomes a NEW version. */
export function restoreKanjiWordsVersion(
  supabase: AppSupabaseClient,
  args: { kanjiId: number; version: number; expectedVersion: number; note: string | null }
): Promise<KanjiWordsBulkResult> {
  return call(supabase, "admin_restore_kanji_words_version", {
    p_kanji_id: args.kanjiId,
    p_version: args.version,
    p_expected_version: args.expectedVersion,
    p_note: args.note,
  });
}

/** `dryRun` only counts what would happen (it runs the real commits and rolls them back). */
export function bulkKanjiWords(
  supabase: AppSupabaseClient,
  args: {
    kanjiIds: number[];
    op: KanjiWordsBulkOp;
    params?: Record<string, unknown>;
    expectedVersions?: Record<number, number>;
    note: string | null;
    dryRun: boolean;
  }
): Promise<KanjiWordsBulkResult> {
  return call(supabase, "admin_bulk_kanji_words", {
    p_kanji_ids: args.kanjiIds,
    p_op: args.op,
    p_params: args.params ?? {},
    p_expected_versions: args.expectedVersions ?? null,
    p_note: args.note,
    p_dry_run: args.dryRun,
  });
}

export function undoKanjiWordsBatch(
  supabase: AppSupabaseClient,
  args: { batchId: string; note: string | null; dryRun: boolean }
): Promise<KanjiWordsBulkResult> {
  return call(supabase, "admin_undo_kanji_words_batch", {
    p_batch_id: args.batchId,
    p_dry_run: args.dryRun,
    p_note: args.note,
  });
}

/** Every kanji goes back to its last version at or before `at` (an ISO timestamp). */
export function restoreKanjiWordsTo(
  supabase: AppSupabaseClient,
  args: { at: string; note: string | null; dryRun: boolean }
): Promise<KanjiWordsBulkResult> {
  return call(supabase, "admin_restore_kanji_words_to", {
    p_at: args.at,
    p_dry_run: args.dryRun,
    p_note: args.note,
  });
}
