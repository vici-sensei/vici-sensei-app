// Shapes returned by the admin_*_kanji_word* RPCs (20261007064452_kanji_words_admin_rpcs.sql) behind
// /admin/kanji-words. Keys of the overview rows are deliberately short: it is one ~600 KB document with a
// row for every kanji, filtered and sorted on the client.

/** [kanji_word_id, word, jlpt_level, level gap vs the kanji, is_common]. The gap is signed
 *  (word rank - kanji rank, a word without a JLPT level counts as beyond N1, like the algorithm does). */
export type KanjiWordTuple = [id: number, word: string, jlpt: string | null, gap: number, common: boolean];

export interface KanjiWordsRow {
  id: number;
  /** The kanji character. */
  k: string;
  /** Kanji JLPT level. */
  lv: string | null;
  /** First meanings. */
  m: string[];
  kun: string[];
  on: string[];
  /** Version (0 = never touched), the number a save has to quote. */
  v: number;
  /** Reviewed mark. */
  r: boolean;
  /** The algorithm's list changed since the last review. */
  ac: boolean;
  /** The final list students see, in rank order. */
  f: KanjiWordTuple[];
  /** The algorithm's own list; null when it equals `f`. */
  a: KanjiWordTuple[] | null;
  /** Last change: when, by whom (null = the system), of which kind. */
  lu: string | null;
  lb: string | null;
  lk: string | null;
}

export interface KanjiWordsOverview {
  generated_at: string;
  kanji: KanjiWordsRow[];
}

/** Why the algorithm took or skipped a candidate (kanji_word_algo_info). */
export interface KanjiWordAlgoInfo {
  /** 0 = normal word, 1 = shared-furigana word, 2 = usually-kana word. */
  cand_class: 0 | 1 | 2;
  /** The candidate is in the best class available to this kanji, the only one the algorithm looks at. */
  in_class: boolean;
  group_size: number | null;
  group_rank: number | null;
  group_selected: boolean | null;
  pick_kind: "champion" | "fill_in" | null;
  dup_of: number | null;
  dup_of_word: string | null;
  champion: number | null;
  champion_word: string | null;
}

export interface KanjiWordCandidate {
  id: number;
  word: string;
  kana: string | null;
  furiganas: string[] | null;
  meanings: string[] | null;
  jlpt: string | null;
  gap: number;
  common: boolean;
  freq: number;
  /** Reading group of the kanji inside this word. */
  rg: number;
  /** The word is enabled for study (a disabled word can never be in a list). */
  enabled: boolean;
  usually_kana: boolean;
  rank: number | null;
  in_final: boolean;
  in_algo: boolean;
  override: "add" | "remove" | null;
  /** Students (both regions) holding a Word reading card on this word. */
  students: number;
  info: KanjiWordAlgoInfo | null;
}

export interface KanjiWordCandidates {
  kanji: { id: number; k: string; lv: string | null; meanings: string[]; kun: string[]; on: string[] };
  version: number;
  reviewed: boolean;
  algo_ids_at_review: number[] | null;
  candidates: KanjiWordCandidate[];
}

export type KanjiWordsHistoryKind =
  | "save"
  | "reset"
  | "restore"
  | "bulk"
  | "undo_batch"
  | "restore_all"
  | "review"
  | "algo_changed";

export interface KanjiWordsHistoryVersion {
  version: number;
  kind: KanjiWordsHistoryKind;
  batch_id: string | null;
  note: string | null;
  admin_email: string | null;
  created_at: string;
  reviewed: boolean;
  add: number[];
  remove: number[];
  final_ids: number[];
  algo_ids: number[];
  detail: Record<string, unknown> | null;
}

export interface KanjiWordsHistory {
  /** Newest first. */
  versions: KanjiWordsHistoryVersion[];
  /** kanji_word_id -> [word, jlpt_level] for every candidate of the kanji. */
  words: Record<string, [string, string | null]>;
}

export interface KanjiWordsBatch {
  batch_id: string;
  kind: KanjiWordsHistoryKind;
  created_at: string;
  admin_email: string | null;
  note: string | null;
  detail: Record<string, unknown> | null;
  /** Kanji the batch touched, and how many of them are still exactly as the batch left them. */
  kanji: number;
  undoable: number;
}

export interface KanjiWordsTodoCount {
  total: number;
  reviewed: number;
  to_review: number;
  algo_changed: number;
}

export interface KanjiWordsParity {
  in_sync: boolean | null;
  error?: string;
}

/** What a bulk operation, an undo or a restore-to-a-moment reports (also for a dry run). */
export interface KanjiWordsBulkResult {
  /** null for a dry run. */
  batch_id: string | null;
  dry_run: boolean;
  changed: number;
  unchanged: number;
  /** Kanji skipped because someone changed them since the page loaded them. */
  conflicts: number[];
  words_added: number;
  words_removed: number;
  /** Undo of a batch only: kanji in the batch / kanji skipped because they were edited after it. */
  batch_kanji?: number;
  skipped_changed_since?: number;
}

export type KanjiWordsBulkOp = "remove_gap" | "reset" | "review";
