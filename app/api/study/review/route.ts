import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { jsonError, requireUser } from '@/lib/api/errors'
import { EXERCISE_TYPES } from '@/lib/srs/constants'
import { PROGRESS_TABLES } from '@/lib/srs/progressTables'
import { applyReview } from '@/lib/srs/scheduler'

const bodySchema = z.object({
  exercise_type: z.enum(EXERCISE_TYPES),
  kanji_id: z.number().int().optional(),
  word_id: z.number().int().optional(),
  kanji_word_id: z.number().int().optional(),
  rating: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  user_answer: z.string().optional(),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { user, response } = await requireUser(supabase)
  if (!user) return response

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? 'Invalid request body.')
  }
  const { exercise_type, rating, user_answer } = parsed.data

  const { table, key } = PROGRESS_TABLES[exercise_type]
  const keyValue =
    exercise_type === 'kanji_meaning'
      ? parsed.data.kanji_id
      : exercise_type === 'kanji_reading'
        ? parsed.data.kanji_word_id
        : parsed.data.word_id

  if (keyValue === undefined) {
    return jsonError(400, `${key} is required for exercise_type "${exercise_type}".`)
  }

  const { data: current, error: currentError } = await supabase
    .from(table)
    .select('*')
    .eq('user_id', user.id)
    .eq(key, keyValue)
    .maybeSingle()

  if (currentError) return jsonError(500, currentError.message)
  if (!current) return jsonError(404, 'No progress found for this card. Introduce it first.')
  if (current.status === 'new' || current.status === 'suspended') {
    return jsonError(400, `Cannot review a card with status "${current.status}".`)
  }

  const updated = applyReview(current, rating)

  const { error: updateError } = await supabase
    .from(table)
    .update({ ...updated, last_reviewed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', current.id)

  if (updateError) return jsonError(500, updateError.message)

  let kanjiIdForLog: number | null = null
  let wordIdForLog: number | null = null

  if (exercise_type === 'kanji_meaning') {
    kanjiIdForLog = current.kanji_id
  } else if (exercise_type === 'vocab_meaning') {
    wordIdForLog = current.word_id
  } else {
    kanjiIdForLog = current.kanji_id
    const { data: kanjiWord, error: kanjiWordError } = await supabase
      .from('kanji_word')
      .select('id_word')
      .eq('id', current.kanji_word_id)
      .single()
    if (kanjiWordError) return jsonError(500, kanjiWordError.message)
    wordIdForLog = kanjiWord.id_word
  }

  const { data: openSession } = await supabase
    .from('study_sessions')
    .select('id')
    .eq('user_id', user.id)
    .is('ended_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { error: logError } = await supabase.from('review_logs').insert({
    user_id: user.id,
    session_id: openSession?.id ?? null,
    exercise_type,
    kanji_id: kanjiIdForLog,
    word_id: wordIdForLog,
    rating,
    correct: rating >= 2,
    user_answer: user_answer ?? null,
    ease_factor_before: current.ease_factor,
    ease_factor_after: updated.ease_factor,
    interval_before: current.interval_days,
    interval_after: updated.interval_days,
    status_before: current.status,
    repetitions_before: current.repetitions,
    lapses_before: current.lapses,
    learning_step_before: current.learning_step,
    due_at_before: current.due_at,
  })

  if (logError) return jsonError(500, logError.message)

  return new NextResponse(null, { status: 204 })
}
