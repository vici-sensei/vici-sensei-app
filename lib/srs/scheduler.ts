import {
  DEFAULT_EASE_FACTOR,
  EASE_AGAIN_PENALTY,
  EASE_EASY_BONUS,
  EASE_HARD_PENALTY,
  EASY_BONUS_MULTIPLIER,
  EASY_GRADUATING_INTERVAL_DAYS,
  GRADUATING_INTERVAL_DAYS,
  HARD_INTERVAL_MULTIPLIER,
  LEARNING_STEPS_MINUTES,
  MIN_EASE_FACTOR,
  SECOND_INTERVAL_DAYS,
  type ProgressStatus,
} from './constants'

export interface ProgressRow {
  status: ProgressStatus
  ease_factor: number
  interval_days: number
  repetitions: number
  lapses: number
  learning_step: number
}

export interface ReviewResult {
  status: ProgressStatus
  ease_factor: number
  interval_days: number
  repetitions: number
  lapses: number
  learning_step: number
  due_at: string
}

function minutesFromNow(minutes: number): string {
  return new Date(Date.now() + minutes * 60_000).toISOString()
}

function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString()
}

function clampEase(ease: number): number {
  return Math.round(Math.max(MIN_EASE_FACTOR, ease) * 100) / 100
}

/**
 * Learning/relearning phase: cards step through LEARNING_STEPS_MINUTES.
 * Again resets to the first step, Hard repeats the current step (no progress lost),
 * Good advances a step (or graduates), Easy skips straight to graduation.
 */
function applyLearningReview(current: ProgressRow, rating: 0 | 1 | 2 | 3): ReviewResult {
  const carry = {
    ease_factor: current.ease_factor,
    lapses: current.lapses,
  }

  if (rating === 0) {
    return {
      ...carry,
      status: current.status,
      interval_days: current.interval_days,
      repetitions: current.repetitions,
      learning_step: 0,
      due_at: minutesFromNow(LEARNING_STEPS_MINUTES[0]),
    }
  }

  if (rating === 1) {
    return {
      ...carry,
      status: current.status,
      interval_days: current.interval_days,
      repetitions: current.repetitions,
      learning_step: current.learning_step,
      due_at: minutesFromNow(LEARNING_STEPS_MINUTES[current.learning_step]),
    }
  }

  if (rating === 3) {
    return {
      ...carry,
      status: 'review',
      interval_days: EASY_GRADUATING_INTERVAL_DAYS,
      repetitions: current.repetitions + 1,
      learning_step: 0,
      due_at: daysFromNow(EASY_GRADUATING_INTERVAL_DAYS),
    }
  }

  const nextStep = current.learning_step + 1
  if (nextStep >= LEARNING_STEPS_MINUTES.length) {
    return {
      ...carry,
      status: 'review',
      interval_days: GRADUATING_INTERVAL_DAYS,
      repetitions: current.repetitions + 1,
      learning_step: 0,
      due_at: daysFromNow(GRADUATING_INTERVAL_DAYS),
    }
  }
  return {
    ...carry,
    status: current.status,
    interval_days: current.interval_days,
    repetitions: current.repetitions,
    learning_step: nextStep,
    due_at: minutesFromNow(LEARNING_STEPS_MINUTES[nextStep]),
  }
}

/**
 * Review phase: Again lapses the card into relearning. Hard/Good/Easy all keep it
 * in review, growing the interval by progressively more (Hard < Good < Easy) while
 * nudging the ease factor down (Hard), unchanged (Good), or up (Easy) — same shape
 * as Anki's default SM-2 scheduler.
 */
function applyReviewPhaseReview(current: ProgressRow, rating: 0 | 1 | 2 | 3): ReviewResult {
  if (rating === 0) {
    return {
      status: 'relearning',
      ease_factor: clampEase(current.ease_factor - EASE_AGAIN_PENALTY),
      interval_days: current.interval_days,
      repetitions: 0,
      lapses: current.lapses + 1,
      learning_step: 0,
      due_at: minutesFromNow(LEARNING_STEPS_MINUTES[0]),
    }
  }

  if (rating === 1) {
    const easeFactor = clampEase(current.ease_factor - EASE_HARD_PENALTY)
    const intervalDays = Math.max(current.interval_days + 1, Math.round(current.interval_days * HARD_INTERVAL_MULTIPLIER))
    return {
      status: 'review',
      ease_factor: easeFactor,
      interval_days: intervalDays,
      repetitions: current.repetitions,
      lapses: current.lapses,
      learning_step: 0,
      due_at: daysFromNow(intervalDays),
    }
  }

  const isEasy = rating === 3
  const easeFactor = clampEase(current.ease_factor + (isEasy ? EASE_EASY_BONUS : 0))
  const repetitions = current.repetitions + 1
  let intervalDays: number
  if (repetitions === 1) intervalDays = GRADUATING_INTERVAL_DAYS
  else if (repetitions === 2) intervalDays = SECOND_INTERVAL_DAYS
  else intervalDays = Math.round(current.interval_days * easeFactor)
  if (isEasy) intervalDays = Math.round(intervalDays * EASY_BONUS_MULTIPLIER)

  return {
    status: 'review',
    ease_factor: easeFactor,
    interval_days: intervalDays,
    repetitions,
    lapses: current.lapses,
    learning_step: 0,
    due_at: daysFromNow(intervalDays),
  }
}

/**
 * Anki-style SM-2 scheduler shared by all three progress tables
 * (user_kanji_meaning_progress, user_kanji_reading_progress, user_vocabulary_progress).
 * `rating` follows the 0-3 scale stored in review_logs (0=Again, 1=Hard, 2=Good, 3=Easy).
 */
export function applyReview(current: ProgressRow, rating: 0 | 1 | 2 | 3): ReviewResult {
  if (current.status === 'learning' || current.status === 'relearning') {
    return applyLearningReview(current, rating)
  }
  return applyReviewPhaseReview(current, rating)
}

export function initialLearningState() {
  return {
    status: 'learning' as ProgressStatus,
    ease_factor: DEFAULT_EASE_FACTOR,
    interval_days: 0,
    repetitions: 0,
    lapses: 0,
    learning_step: 0,
    due_at: minutesFromNow(LEARNING_STEPS_MINUTES[0]),
  }
}

/** Formats a due date as a short Anki-style label: "<1m", "10m", "3h", "4d", "3.2mo", "1.4y". */
export function formatIntervalLabel(dueAt: string): string {
  const minutes = (new Date(dueAt).getTime() - Date.now()) / 60_000
  if (minutes < 1) return '<1m'
  if (minutes < 60) return `${Math.round(minutes)}m`
  const hours = minutes / 60
  if (hours < 24) return `${Math.round(hours)}h`
  const days = hours / 24
  if (days < 30) return `${Math.round(days)}d`
  const months = days / 30
  if (months < 12) return `${Math.round(months * 10) / 10}mo`
  const years = days / 365
  return `${Math.round(years * 10) / 10}y`
}

export interface RatingPreviews {
  again: string
  hard: string
  good: string
  easy: string
}

/** Previews the interval label each rating would produce for this card, for display on the rating buttons. */
export function previewRatingLabels(current: ProgressRow): RatingPreviews {
  return {
    again: formatIntervalLabel(applyReview(current, 0).due_at),
    hard: formatIntervalLabel(applyReview(current, 1).due_at),
    good: formatIntervalLabel(applyReview(current, 2).due_at),
    easy: formatIntervalLabel(applyReview(current, 3).due_at),
  }
}
