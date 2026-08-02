import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { jsonError, requireUser } from '@/lib/api/errors'
import { PROGRESS_TABLES } from '@/lib/srs/progressTables'
import type { ExerciseType } from '@/lib/srs/constants'

const bodySchema = z.object({ review_log_id: z.number().int().optional() })

export async function POST(request: Request) {
  const supabase = await createClient()
  const { user, response } = await requireUser(supabase)
  if (!user) return response

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? 'Invalid request body.')
  }

  let logQuery = supabase.from('review_logs').select('*').eq('user_id', user.id).eq('undone', false)
  logQuery = parsed.data.review_log_id
    ? logQuery.eq('id', parsed.data.review_log_id)
    : logQuery.order('reviewed_at', { ascending: false }).limit(1)

  const { data: logs, error: logError } = await logQuery
  if (logError) return jsonError(500, logError.message)

  const log = logs?.[0]
  if (!log) return jsonError(404, 'No undoable review found.')

  const exerciseType = log.exercise_type as ExerciseType
  const { table, key } = PROGRESS_TABLES[exerciseType]

  let keyValue: number
  if (exerciseType === 'kanji_meaning') {
    keyValue = log.kanji_id
  } else if (exerciseType === 'vocab_meaning') {
    keyValue = log.word_id
  } else {
    const { data: kanjiWord, error: kanjiWordError } = await supabase
      .from('kanji_word')
      .select('id')
      .eq('id_kanji', log.kanji_id)
      .eq('id_word', log.word_id)
      .single()
    if (kanjiWordError) return jsonError(500, kanjiWordError.message)
    keyValue = kanjiWord.id
  }

  const { error: restoreError } = await supabase
    .from(table)
    .update({
      status: log.status_before,
      ease_factor: log.ease_factor_before,
      interval_days: log.interval_before,
      repetitions: log.repetitions_before,
      lapses: log.lapses_before,
      learning_step: log.learning_step_before,
      due_at: log.due_at_before,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)
    .eq(key, keyValue)

  if (restoreError) return jsonError(500, restoreError.message)

  const { error: markUndoneError } = await supabase
    .from('review_logs')
    .update({ undone: true })
    .eq('id', log.id)

  if (markUndoneError) return jsonError(500, markUndoneError.message)

  return new NextResponse(null, { status: 204 })
}
