import type { ExerciseType, ProgressStatus } from "@/lib/srs/constants";
import type { KanjiMeaningProgress, KanjiReadingProgress } from "./progress";
import type { KanjiDetailWord } from "./kanji";

export interface DueCard {
  exercise_type: ExerciseType;
  progress_id: number;
  kanji_id: number | null;
  word_id: number | null;
  kanji_word_id: number | null;
  status: ProgressStatus;
  due_at: string;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  lapses: number;
  learning_step: number;
  kanji_char: string | null;
  kanji_meanings: string[] | null;
  word: string | null;
  kana_reading: string | null;
  romaji_reading: string | null;
  other_readings: string[] | null;
  furiganas: string[] | null;
}

export interface NewKanjiCandidate {
  id: number;
  kanji: string;
  meanings: string[] | null;
  level: string | null;
  kun_readings: string[] | null;
  on_readings: string[] | null;
  words: KanjiDetailWord[];
}

export interface NewVocabCandidate {
  id: number;
  word: string;
  kana_reading: string | null;
  meanings: string[] | null;
  parts_of_speech: string[] | null;
  ids_kanji: number[] | null;
  jlpt_level: string | null;
  is_common_jisho: boolean | null;
  usually_kana: boolean | null;
  frequency: string | null;
  romaji_reading: string | null;
  furiganas: string[] | null;
  romaji_furiganas: string[] | null;
  other_readings: string[] | null;
}

export interface StudyQueueResponse {
  due_cards: DueCard[];
  new_kanji_to_introduce: NewKanjiCandidate[];
  new_vocab_to_introduce: NewVocabCandidate[];
}

export interface StudyStats {
  due_today: number;
  new_kanji_today: number;
  new_kanji_limit: number;
  new_vocab_today: number;
  new_vocab_limit: number;
  streak: number;
  retention_rate: number | null;
}

export type Rating = 0 | 1 | 2 | 3;

export interface ReviewRequestBody {
  exercise_type: ExerciseType;
  kanji_id?: number;
  word_id?: number;
  kanji_word_id?: number;
  rating: Rating;
  user_answer?: string;
}

export interface ReviewResult {
  status: ProgressStatus;
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  lapses: number;
  learning_step: number;
  due_at: string;
}

export interface UndoReviewResponse {
  undone_review_log_id: number;
}

export interface IntroduceKanjiResponse {
  meaning: KanjiMeaningProgress;
  readings: KanjiReadingProgress[];
}

export interface StudySessionStart {
  session_id: number;
  started_at: string;
}

export interface StudySessionEnd {
  id: number;
  user_id: string;
  started_at: string;
  ended_at: string;
  cards_reviewed: number;
  cards_correct: number;
  new_cards_learned: number;
  duration_seconds: number;
  accuracy: number | null;
}
