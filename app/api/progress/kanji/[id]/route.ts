import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { jsonError, requireUser } from '@/lib/api/errors'
import { fetchKanjiProgress } from '@/lib/data/progress'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { user, response } = await requireUser(supabase)
  if (!user) return response

  try {
    const data = await fetchKanjiProgress(supabase, user.id, Number(id))
    return NextResponse.json(data)
  } catch (err) {
    return jsonError(500, err instanceof Error ? err.message : 'Failed to load kanji progress.')
  }
}
