import { DEFAULT_EASE_FACTOR, LEARNING_STEPS_MINUTES, MIN_EASE_FACTOR, type ProgressStatus } from './constants'

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

/**
 * Pure SM-2-style scheduler shared by all three progress tables
 * (user_kanji_meaning_progress, user_kanji_reading_progress, user_vocabulary_progress).
 * `rating` follows the 0-3 scale stored in review_logs (0/1 = fail, 2/3 = pass).
 */
export function applyReview(current: ProgressRow, rating: 0 | 1 | 2 | 3): ReviewResult {
  const passed = rating >= 2

  if (current.status === 'learning' || current.status === 'relearning') {
    if (passed) {
      const nextStep = current.learning_step + 1
      if (nextStep >= LEARNING_STEPS_MINUTES.length) {
        return {
          status: 'review',
          ease_factor: current.ease_factor,
          interval_days: 1,
          repetitions: current.repetitions,
          lapses: current.lapses,
          learning_step: 0,
          due_at: daysFromNow(1),
        }
      }
      return {
        status: current.status,
        ease_factor: current.ease_factor,
        interval_days: current.interval_days,
        repetitions: current.repetitions,
        lapses: current.lapses,
        learning_step: nextStep,
        due_at: minutesFromNow(LEARNING_STEPS_MINUTES[nextStep]),
      }
    }

    return {
      status: current.status,
      ease_factor: current.ease_factor,
      interval_days: current.interval_days,
      repetitions: current.repetitions,
      lapses: current.lapses,
      learning_step: 0,
      due_at: minutesFromNow(LEARNING_STEPS_MINUTES[0]),
    }
  }

  // status === 'review'
  if (!passed) {
    return {
      status: 'relearning',
      ease_factor: current.ease_factor,
      interval_days: 1,
      repetitions: 0,
      lapses: current.lapses + 1,
      learning_step: 0,
      due_at: minutesFromNow(LEARNING_STEPS_MINUTES[0]),
    }
  }

  const easeFactor = Math.max(
    MIN_EASE_FACTOR,
    current.ease_factor + (0.1 - (3 - rating) * (0.08 + (3 - rating) * 0.02))
  )
  const repetitions = current.repetitions + 1
  let intervalDays: number
  if (repetitions === 1) intervalDays = 1
  else if (repetitions === 2) intervalDays = 6
  else intervalDays = Math.round(current.interval_days * easeFactor)

  return {
    status: 'review',
    ease_factor: Math.round(easeFactor * 100) / 100,
    interval_days: intervalDays,
    repetitions,
    lapses: current.lapses,
    learning_step: 0,
    due_at: daysFromNow(intervalDays),
  }
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
