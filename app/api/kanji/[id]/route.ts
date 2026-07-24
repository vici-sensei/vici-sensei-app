import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { jsonError, requireUser } from '@/lib/api/errors'

type KanjiDetailWordRow = {
  kanji_word_id: number
  reading_number: number | null
  word_id: number
  word: string
  kana_reading: string | null
  meanings: string[] | null
  level: string | null
  furiganas: string[] | null
}

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

  const { data: wordRows, error: wordsError } = await supabase.rpc('get_kanji_detail_words', {
    p_kanji_id: id,
  })

  if (wordsError) {
    return jsonError(500, wordsError.message)
  }

  const words = ((wordRows ?? []) as KanjiDetailWordRow[]).map((row) => ({
    id: row.kanji_word_id,
    reading_number: row.reading_number,
    vocabulary: {
      id: row.word_id,
      word: row.word,
      kana_reading: row.kana_reading,
      meanings: row.meanings,
      level: row.level,
      furiganas: row.furiganas,
    },
  }))

  return NextResponse.json({ ...kanji, words })
}
