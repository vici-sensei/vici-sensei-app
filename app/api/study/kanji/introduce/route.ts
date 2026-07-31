import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { jsonError, requireUser } from '@/lib/api/errors'
import { initialLearningState } from '@/lib/srs/scheduler'

const bodySchema = z.object({ kanji_id: z.number().int(), session_id: z.number().int().optional() })

export async function POST(request: Request) {
  const supabase = await createClient()
  const { user, response } = await requireUser(supabase)
  if (!user) return response

  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})))
  if (!parsed.success) {
    return jsonError(400, parsed.error.issues[0]?.message ?? 'Invalid request body.')
  }
  const { kanji_id, session_id } = parsed.data

  const { data: existing, error: existingError } = await supabase
    .from('user_kanji_meaning_progress')
    .select('id')
    .eq('user_id', user.id)
    .eq('kanji_id', kanji_id)
    .maybeSingle()

  if (existingError) return jsonError(500, existingError.message)
  if (existing) return jsonError(409, 'This kanji has already been introduced.')

  const { data: meaningRow, error: meaningError } = await supabase
    .from('user_kanji_meaning_progress')
    .insert({ user_id: user.id, kanji_id, session_id: session_id ?? null, ...initialLearningState() })
    .select('*')
    .single()

  if (meaningError) return jsonError(500, meaningError.message)

  const { data: kanjiWords, error: kanjiWordsError } = await supabase.rpc(
    'get_kanji_detail_words',
    { p_kanji_id: kanji_id }
  )

  if (kanjiWordsError) return jsonError(500, kanjiWordsError.message)

  let readingRows: unknown[] = []
  if (kanjiWords && kanjiWords.length > 0) {
    const { data, error: readingInsertError } = await supabase
      .from('user_kanji_reading_progress')
      .insert(
        kanjiWords.map((kw: { kanji_word_id: number }) => ({
          user_id: user.id,
          kanji_id,
          kanji_word_id: kw.kanji_word_id,
          ...initialLearningState(),
        }))
      )
      .select('*')

    if (readingInsertError) return jsonError(500, readingInsertError.message)
    readingRows = data
  }

  return NextResponse.json({ meaning: meaningRow, readings: readingRows }, { status: 201 })
}
