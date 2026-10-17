// Shapes returned by the admin_*_kanji_word* RPCs (20261007064452_kanji_words_admin_rpcs.sql) behind
// /admin/kanji-words. Keys of the overview rows are deliberately short: it is one ~600 KB document with a
// row for every kanji, filtered and sorted on the client.

/** [kanji_word_id, word, jlpt_level, level gap vs the kanji, is_common, furiganas, kana]. The gap is signed
 *  (word rank - kanji rank, a word without a JLPT level counts as beyond N1, like the algorithm does). The
 *  furiganas (one per character, as vocabulary stores them) came with 20261017035637_kanji_words_overview_furigana.sql,
 *  the kana (the kana_reading of a word shown in kana, see showsKanaOnly(); null otherwise) with
 *  20261017040646_kanji_words_overview_usually_kana.sql: absent from an older RPC. */
export type KanjiWordTuple = [
  id: number,
  word: string,
  jlpt: string | null,
  gap: number,
  common: boolean,
  furiganas?: string[] | null,
  kana?: string | null,
];

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

/** [short meaning or null, primary meanings, secondary senses] of one word (admin_get_kanji_words_meanings). */
export type KanjiWordMeaningsTuple = [short: string | null, primary: string[], other: string[][]];

/** kanji_word_id -> the meanings of its word, for the kanji list's word chips. */
export type KanjiWordsMeaningsMap = Record<string, KanjiWordMeaningsTuple>;

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
  /** The short meaning glued in front of the primary ones (vocabulary_primary_meanings), like a card shows them. */
  meanings: string[] | null;
  /** The three kinds of meaning apart (20261011040512_kanji_words_admin_meanings.sql); absent from an RPC
   *  older than that, see candidateMeanings(). `short` is null when the word has none, `other` holds one
   *  array of glosses per secondary sense. */
  short?: string | null;
  primary?: string[];
  other?: string[][];
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
  /** An admin checked the word's dictionary data (20261015200558_vocabulary_review_mark.sql); null = not yet.
   *  Absent from an RPC older than that. The mark is the word's, so it shows under every kanji of the word. */
  reviewed?: VocabularyReviewMark | null;
  info: KanjiWordAlgoInfo | null;
}

/** Who marked a word as reviewed, and when. */
export interface VocabularyReviewMark {
  at: string;
  /** The admin's email; null if they no longer exist. */
  by: string | null;
}

/** One marked word, as admin_get_vocabulary_reviews lists it. */
export interface VocabularyReviewRow extends VocabularyReviewMark {
  /** The vocabulary id. */
  id: number;
}

/** What admin_set_vocabulary_reviewed returns. */
export interface VocabularyReviewResult {
  /** false = the word was already like that: nothing changed. */
  changed: boolean;
  reviewed: VocabularyReviewMark | null;
  /** Every kanji_word row of the word (one per kanji it contains), for refreshing the page. */
  kanji_word_ids: number[];
}

/** The dictionary row of one candidate's word (fetchKanjiWordVocabulary), for the word details popup. */
export interface KanjiWordVocabulary {
  id: number;
  word: string;
  kana_reading: string | null;
  romaji_reading: string | null;
  furiganas: string[] | null;
  romaji_furiganas: string[] | null;
  other_readings: string[] | null;
  short_meaning: string | null;
  primary_meanings: string[] | null;
  /** One array of glosses per secondary sense. */
  other_meanings: string[][] | null;
  parts_of_speech: string[] | null;
  jlpt_level: string | null;
  is_common_jisho: boolean | null;
  usually_kana: boolean | null;
  study_enabled: boolean;
}

/** The columns of a word the popup can edit (admin_update_vocabulary): everything but its id and the word itself. */
export type VocabularyEditable = Omit<KanjiWordVocabulary, "id" | "word">;

export interface VocabularyUpdateResult {
  /** false = what was sent equals what is stored: nothing was written. */
  changed: boolean;
  /** The editable columns as stored now. */
  vocabulary: VocabularyEditable;
  /** Every kanji_word row of the word (one per kanji it contains), for refreshing the page. */
  kanji_word_ids: number[];
  /** The log row of this change (what "Undo" reverts); null when nothing changed. */
  edit_id: string | null;
}

/** One logged change of a word (admin_get_vocabulary_edits), newest first. */
export interface VocabularyEdit {
  id: string;
  /** "edit" = a save from the popup; "restore" = the word put back as it was around an earlier row (an undo too). */
  kind: "edit" | "restore";
  /** restore only: the row whose state was put back, and which side of it ("before" = an undo of that row). */
  restored_from: string | null;
  restored_side: "before" | "after" | null;
  before: VocabularyEditable;
  after: VocabularyEditable;
  admin_email: string | null;
  created_at: string;
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
