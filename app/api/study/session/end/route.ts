import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { jsonError, requireUser } from '@/lib/api/errors'

const bodySchema = z.object({ session_id: z.number().int() })

export async function POST(request: Request) {
  const supabase = await createClient()
  const { user, response } = await requireUser(supabase)
  if (!user) return response

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? 'Invalid request body.')
  }

  const { data: session, error: sessionError } = await supabase
    .from('study_sessions')
    .select('id, started_at')
    .eq('id', parsed.data.session_id)
    .eq('user_id', user.id)
    .maybeSingle()

  if (sessionError) return jsonError(500, sessionError.message)
  if (!session) return jsonError(404, 'Study session not found.')

  const endedAt = new Date().toISOString()

  const { data: logs, error: logsError } = await supabase
    .from('review_logs')
    .select('correct')
    .eq('user_id', user.id)
    .eq('undone', false)
    .gte('reviewed_at', session.started_at)
    .lte('reviewed_at', endedAt)

  if (logsError) return jsonError(500, logsError.message)

  const cardsReviewed = logs.length
  const cardsCorrect = logs.filter((log) => log.correct).length

  const { data: updated, error: updateError } = await supabase
    .from('study_sessions')
    .update({ ended_at: endedAt, cards_reviewed: cardsReviewed, cards_correct: cardsCorrect })
    .eq('id', session.id)
    .select('*')
    .single()

  if (updateError) return jsonError(500, updateError.message)

  const durationMs = new Date(endedAt).getTime() - new Date(session.started_at).getTime()

  return NextResponse.json({
    ...updated,
    duration_seconds: Math.round(durationMs / 1000),
    accuracy: cardsReviewed > 0 ? cardsCorrect / cardsReviewed : null,
  })
}
