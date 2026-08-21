export const JLPT_LEVELS = ['N5', 'N4', 'N3', 'N2', 'N1'] as const
export type JlptLevel = (typeof JLPT_LEVELS)[number]

/** The most advanced level present in an enabled_levels array (defaults to N5). */
export function mostAdvancedLevel(levels: readonly string[]): JlptLevel {
  let best = 0
  for (const level of levels) {
    const idx = JLPT_LEVELS.indexOf(level as JlptLevel)
    if (idx > best) best = idx
  }
  return JLPT_LEVELS[best]
}

/** The least advanced level present in an enabled_levels array (defaults to N1). */
export function leastAdvancedLevel(levels: readonly string[]): JlptLevel {
  let worst = JLPT_LEVELS.length - 1
  for (const level of levels) {
    const idx = JLPT_LEVELS.indexOf(level as JlptLevel)
    if (idx >= 0 && idx < worst) worst = idx
  }
  return JLPT_LEVELS[worst]
}

/** Every level from `floor` up to and including `ceiling`. */
export function levelsInRange(floor: JlptLevel, ceiling: JlptLevel): JlptLevel[] {
  const floorIdx = JLPT_LEVELS.indexOf(floor)
  const ceilingIdx = JLPT_LEVELS.indexOf(ceiling)
  return JLPT_LEVELS.slice(floorIdx, ceilingIdx + 1)
}

export const LEARNING_STEPS_MINUTES = [1, 10] as const

export const MIN_EASE_FACTOR = 1.3
export const DEFAULT_EASE_FACTOR = 2.5

// Anki-style SM-2 tuning: penalties/bonuses applied to the ease factor per rating,
// and the interval ladder used once a card is in the 'review' phase.
export const EASE_AGAIN_PENALTY = 0.2
export const EASE_HARD_PENALTY = 0.15
export const EASE_EASY_BONUS = 0.15
export const HARD_INTERVAL_MULTIPLIER = 1.2
export const EASY_BONUS_MULTIPLIER = 1.3
export const GRADUATING_INTERVAL_DAYS = 1
export const EASY_GRADUATING_INTERVAL_DAYS = 4
export const SECOND_INTERVAL_DAYS = 6

export const EXERCISE_TYPES = ['kanji_meaning', 'kanji_reading', 'vocab_meaning', 'hiragana_reading', 'katakana_reading'] as const
export type ExerciseType = (typeof EXERCISE_TYPES)[number]

export const PROGRESS_STATUSES = ['new', 'learning', 'review', 'relearning', 'suspended'] as const
export type ProgressStatus = (typeof PROGRESS_STATUSES)[number]
