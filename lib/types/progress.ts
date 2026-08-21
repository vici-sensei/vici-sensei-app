import type { ProgressStatus } from "@/lib/srs/constants";

export interface KanjiMeaningProgress {
  status: ProgressStatus;
  due_at: string;
}

export interface KanjiReadingProgress {
  id: number;
  status: ProgressStatus;
  due_at: string;
  kanji_word_id: number;
  /** Only present on GET /api/progress/kanji/[id], via join. */
  kanji_word?: {
    reading_group: number | null;
    vocabulary: { word: string; kana_reading: string | null } | null;
  };
}

export interface VocabularyProgress {
  status: ProgressStatus;
  due_at: string;
}

export interface KanjiProgressResponse {
  meaning: KanjiMeaningProgress | null;
  readings: KanjiReadingProgress[];
}

export interface ProgressStatusCounts {
  new: number;
  learning: number;
  review: number;
  relearning: number;
  suspended: number;
}

export interface ProgressSummaryResponse {
  kanji_meaning: ProgressStatusCounts;
  kanji_reading: ProgressStatusCounts;
  vocab_meaning: ProgressStatusCounts;
  hiragana_reading: ProgressStatusCounts;
  katakana_reading: ProgressStatusCounts;
}
