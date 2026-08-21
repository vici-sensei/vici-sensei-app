import type { ExerciseType } from './constants'

export const PROGRESS_TABLES = {
  kanji_meaning: { table: 'user_kanji_meaning_progress', key: 'kanji_id' },
  kanji_reading: { table: 'user_kanji_reading_progress', key: 'kanji_word_id' },
  vocab_meaning: { table: 'user_vocabulary_progress', key: 'word_id' },
  hiragana_reading: { table: 'user_hiragana_progress', key: 'hiragana_id' },
  katakana_reading: { table: 'user_katakana_progress', key: 'katakana_id' },
} as const satisfies Record<ExerciseType, { table: string; key: string }>

/** Short names used by the manual card-control routes (/api/cards/:type/:id/*). */
export const CARD_TYPE_TO_EXERCISE_TYPE = {
  meaning: 'kanji_meaning',
  reading: 'kanji_reading',
  vocab: 'vocab_meaning',
} as const satisfies Record<string, ExerciseType>

export type CardType = keyof typeof CARD_TYPE_TO_EXERCISE_TYPE
