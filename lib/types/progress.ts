import type { ProgressStatus } from "@/lib/srs/constants";

export interface ProgressRow {
  id: number;
  user_id: string;
  status: ProgressStatus;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  lapses: number;
  learning_step: number;
  due_at: string;
  last_reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface KanjiMeaningProgress extends ProgressRow {
  kanji_id: number;
}

export interface KanjiReadingProgress extends ProgressRow {
  kanji_id: number;
  kanji_word_id: number;
  /** Only present on GET /api/progress/kanji/[id], via join. */
  kanji_word?: {
    reading_number: number | null;
    vocabulary: { word: string; kana_reading: string | null } | null;
  };
}

export interface VocabularyProgress extends ProgressRow {
  word_id: number;
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
}
