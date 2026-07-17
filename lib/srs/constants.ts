export const JLPT_LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'] as const
export type JlptLevel = (typeof JLPT_LEVELS)[number]

export const LEARNING_STEPS_MINUTES = [1, 10] as const

export const MIN_EASE_FACTOR = 1.3
export const DEFAULT_EASE_FACTOR = 2.5

export const EXERCISE_TYPES = ['kanji_meaning', 'kanji_reading', 'vocab_meaning'] as const
export type ExerciseType = (typeof EXERCISE_TYPES)[number]

export const PROGRESS_STATUSES = ['new', 'learning', 'review', 'relearning', 'suspended'] as const
export type ProgressStatus = (typeof PROGRESS_STATUSES)[number]
