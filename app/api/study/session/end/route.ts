import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { jsonError, requireUser } from '@/lib/api/errors'

const bodySchema = z.object({ session_id: z.number().int() })

type EndStudySessionRow = {
  id: number
  started_at: string
  ended_at: string
  cards_reviewed: number
  cards_correct: number
  duration_seconds: number
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { user, response } = await requireUser(supabase)
  if (!user) return response

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? 'Invalid request body.')
  }

  const { data, error } = await supabase.rpc('end_study_session', {
    p_user_id: user.id,
    p_session_id: parsed.data.session_id,
  })

  if (error) return jsonError(500, error.message)
  const row = ((data ?? []) as EndStudySessionRow[])[0]
  if (!row) return jsonError(404, 'Study session not found.')

  return NextResponse.json({
    ...row,
    user_id: user.id,
    accuracy: row.cards_reviewed > 0 ? row.cards_correct / row.cards_reviewed : null,
  })
}
