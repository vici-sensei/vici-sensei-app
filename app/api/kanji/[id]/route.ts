import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { jsonError, requireUser } from '@/lib/api/errors'
import { fetchKanjiDetailWords } from '@/lib/kanji/detailWords'

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

  const { words, error: wordsError } = await fetchKanjiDetailWords(supabase, Number(id))

  if (wordsError) {
    return jsonError(500, wordsError)
  }

  return NextResponse.json({ ...kanji, words })
}
