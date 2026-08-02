import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { jsonError, requireUser } from '@/lib/api/errors'
import { initialLearningState } from '@/lib/srs/scheduler'

const bodySchema = z.object({ word_id: z.number().int(), session_id: z.number().int().optional() })

export async function POST(request: Request) {
  const supabase = await createClient()
  const { user, response } = await requireUser(supabase)
  if (!user) return response

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? 'Invalid request body.')
  }
  const { word_id, session_id } = parsed.data

  const { data: existing, error: existingError } = await supabase
    .from('user_vocabulary_progress')
    .select('id')
    .eq('user_id', user.id)
    .eq('word_id', word_id)
    .maybeSingle()

  if (existingError) return jsonError(500, existingError.message)
  if (existing) return jsonError(409, 'This word has already been introduced.')

  const { error } = await supabase
    .from('user_vocabulary_progress')
    .insert({ user_id: user.id, word_id, session_id: session_id ?? null, ...initialLearningState() })

  if (error) return jsonError(500, error.message)

  return new NextResponse(null, { status: 204 })
}
