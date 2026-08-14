import type { ExerciseType } from "@/lib/srs/constants";

export interface NewKanjiIntroWord {
  id: number;
  vocabulary: {
    word: string;
    meanings: string[] | null;
    jlpt_level: string | null;
    usually_kana: boolean | null;
    furiganas: string[] | null;
  };
}

export interface RatingPreviews {
  again: string;
  hard: string;
  good: string;
  easy: string;
}

export interface DueCard {
  exercise_type: ExerciseType;
  progress_id: number;
  kanji_id: number | null;
  word_id: number | null;
  kanji_word_id: number | null;
  kanji_char: string | null;
  kanji_meanings: string[] | null;
  word: string | null;
  kana_reading: string | null;
  romaji_reading: string | null;
  other_readings: string[] | null;
  furiganas: string[] | null;
  word_meanings: string[] | null;
  /** Meanings from every vocabulary row sharing this word -- the student can't tell which row a card was built from. */
  all_word_meanings: string[] | null;
  /** Readings (kana/romaji/other) from every vocabulary row sharing this word -- same reasoning. */
  all_word_readings: string[] | null;
  rating_previews: RatingPreviews;
}

export interface NewKanjiCandidate {
  id: number;
  kanji: string;
  meanings: string[] | null;
  level: string | null;
  kun_readings: string[] | null;
  on_readings: string[] | null;
  words: NewKanjiIntroWord[];
}

export interface NewVocabCandidate {
  id: number;
  word: string;
  kana_reading: string | null;
  meanings: string[] | null;
  parts_of_speech: string[] | null;
  jlpt_level: string | null;
  usually_kana: boolean | null;
  furiganas: string[] | null;
}

export interface StudyQueueResponse {
  due_cards: DueCard[];
  new_kanji_to_introduce: NewKanjiCandidate[];
  new_vocab_to_introduce: NewVocabCandidate[];
  next_due_at: string | null;
}

export interface WeeklyActivityDay {
  /** Local calendar date (YYYY-MM-DD) in the user's timezone. */
  date: string;
  active: boolean;
}

export interface StudyStats {
  due_today: number;
  new_kanji_today: number;
  new_kanji_limit: number;
  new_vocab_today: number;
  new_vocab_limit: number;
  /** Current unbroken run of days studied, ending today. */
  streak: number;
  /** Raw per-day activity for the last 7 local days, oldest first, ending today -- independent of `streak`. */
  weekly_activity: WeeklyActivityDay[];
  retention_rate: number | null;
  next_due_at: string | null;
  next_due_is_today: boolean;
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
  next_due_at: string | null;
  next_due_is_today: boolean;
}
