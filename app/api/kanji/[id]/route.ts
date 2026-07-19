import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { jsonError, requireUser } from '@/lib/api/errors'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { user, response } = await requireUser(supabase)
  if (!user) return response

  const { data: kanji, error: kanjiError } = await supabase
    .from('kanji')
    .select('*')
    .eq('id', id)
    .maybeSingle()

  if (kanjiError) {
    return jsonError(500, kanjiError.message)
  }
  if (!kanji) {
    return jsonError(404, 'Kanji not found.')
  }

  const { data: words, error: wordsError } = await supabase
    .from('kanji_word')
    .select('id, reading_number, priority_score, vocabulary:id_word(id, word, kana_reading, meanings, furiganas)')
    .eq('id_kanji', id)
    .order('reading_number', { ascending: true, nullsFirst: false })
    .order('priority_score', { ascending: false, nullsFirst: false })
    .limit(3)

  if (wordsError) {
    return jsonError(500, wordsError.message)
  }

  return NextResponse.json({ ...kanji, words })
}
