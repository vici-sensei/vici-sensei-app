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
  parts_of_speech: string[] | null
  ids_kanji: number[] | null
  jlpt_level: string | null
  is_common_jisho: boolean | null
  usually_kana: boolean | null
  frequency: string | null
  romaji_reading: string | null
  furiganas: string[] | null
  romaji_furiganas: string[] | null
  other_readings: string[] | null
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
      parts_of_speech: row.parts_of_speech,
      ids_kanji: row.ids_kanji,
      jlpt_level: row.jlpt_level,
      is_common_jisho: row.is_common_jisho,
      usually_kana: row.usually_kana,
      frequency: row.frequency,
      romaji_reading: row.romaji_reading,
      furiganas: row.furiganas,
      romaji_furiganas: row.romaji_furiganas,
      other_readings: row.other_readings,
    },
  }))

  return NextResponse.json({ ...kanji, words })
}
