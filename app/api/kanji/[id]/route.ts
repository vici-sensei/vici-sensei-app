import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { jsonError, requireUser } from '@/lib/api/errors'
import { fetchKanjiDetail } from '@/lib/data/kanji'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { user, response } = await requireUser(supabase)
  if (!user) return response

  let kanji
  try {
    kanji = await fetchKanjiDetail(Number(id))
  } catch (err) {
    return jsonError(500, err instanceof Error ? err.message : 'Failed to load kanji.')
  }

  if (!kanji) {
    return jsonError(404, 'Kanji not found.')
  }

  return NextResponse.json(kanji)
}
