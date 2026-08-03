import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { jsonError, requireUser } from '@/lib/api/errors'
import { JLPT_LEVELS } from '@/lib/srs/constants'
import { fetchStudySettings } from '@/lib/data/studySettings'

export async function GET() {
  const supabase = await createClient()
  const { user, response } = await requireUser(supabase)
  if (!user) return response

  let data
  try {
    data = await fetchStudySettings(supabase, user.id)
  } catch (err) {
    return jsonError(500, err instanceof Error ? err.message : 'Failed to load study settings.')
  }

  if (!data) {
    return jsonError(404, 'No study settings found. Complete onboarding first.')
  }

  return NextResponse.json(data)
}

const patchSchema = z
  .object({
    new_kanji_per_day: z.number().int().min(1).optional(),
    new_vocab_per_day: z.number().int().min(0).optional(),
    max_reviews_per_day: z.number().int().min(1).optional(),
    enabled_levels: z.array(z.enum(JLPT_LEVELS)).min(1).optional(),
    study_kanji: z.boolean().optional(),
    study_vocabulary: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, {
    message: 'At least one field must be provided.',
  })

export async function PATCH(request: Request) {
  const supabase = await createClient()
  const { user, response } = await requireUser(supabase)
  if (!user) return response

  const parsed = patchSchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? 'Invalid request body.')
  }

  if (parsed.data.study_kanji === false || parsed.data.study_vocabulary === false) {
    const { data: current, error: currentError } = await supabase
      .from('user_study_settings')
      .select('study_kanji, study_vocabulary')
      .eq('user_id', user.id)
      .maybeSingle()

    if (currentError) {
      return jsonError(500, currentError.message)
    }

    const nextStudyKanji = parsed.data.study_kanji ?? current?.study_kanji ?? true
    const nextStudyVocabulary = parsed.data.study_vocabulary ?? current?.study_vocabulary ?? true

    if (!nextStudyKanji && !nextStudyVocabulary) {
      return jsonError(400, 'At least one of study_kanji or study_vocabulary must remain true.')
    }
  }

  const { data, error } = await supabase
    .from('user_study_settings')
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .select('*')
    .single()

  if (error) {
    return jsonError(500, error.message)
  }

  return NextResponse.json(data)
}
