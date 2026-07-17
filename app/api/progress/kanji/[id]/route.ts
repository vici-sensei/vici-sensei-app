import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { jsonError, requireUser } from '@/lib/api/errors'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { user, response } = await requireUser(supabase)
  if (!user) return response

  const { data: meaning, error: meaningError } = await supabase
    .from('user_kanji_meaning_progress')
    .select('*')
    .eq('user_id', user.id)
    .eq('kanji_id', id)
    .maybeSingle()

  if (meaningError) return jsonError(500, meaningError.message)

  const { data: readings, error: readingsError } = await supabase
    .from('user_kanji_reading_progress')
    .select(
      '*, kanji_word:kanji_word_id(reading_number, vocabulary:id_word(word, kana_reading))'
    )
    .eq('user_id', user.id)
    .eq('kanji_id', id)

  if (readingsError) return jsonError(500, readingsError.message)

  return NextResponse.json({ meaning, readings })
}
