import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { jsonError, requireUser } from '@/lib/api/errors'
import { JLPT_LEVELS } from '@/lib/srs/constants'

const bodySchema = z.object({
  new_kanji_per_day: z.number().int().min(0).optional(),
  new_vocab_per_day: z.number().int().min(0).optional(),
  max_reviews_per_day: z.number().int().min(0).optional(),
  enabled_levels: z.array(z.enum(JLPT_LEVELS)).min(1).optional(),
  study_kanji: z.boolean().optional(),
  study_vocabulary: z.boolean().optional(),
})

export async function POST(request: Request) {
  const supabase = await createClient()
  const { user, response } = await requireUser(supabase)
  if (!user) return response

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? 'Invalid request body.')
  }

  const { data, error } = await supabase
    .from('user_study_settings')
    .upsert({ user_id: user.id, ...parsed.data }, { onConflict: 'user_id' })
    .select('*')
    .single()

  if (error) return jsonError(500, error.message)

  return NextResponse.json(data, { status: 201 })
}
