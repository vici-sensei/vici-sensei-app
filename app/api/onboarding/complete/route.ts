import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { jsonError, requireUser } from '@/lib/api/errors'
import { JLPT_LEVELS } from '@/lib/srs/constants'

const bodySchema = z.object({
  enabled_levels: z.array(z.enum(JLPT_LEVELS)).min(1),
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
    .update({
      enabled_levels: parsed.data.enabled_levels,
      onboarding_completed: true,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error) return jsonError(500, error.message)

  return NextResponse.json(data)
}
