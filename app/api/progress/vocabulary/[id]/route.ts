import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { jsonError, requireUser } from '@/lib/api/errors'
import { fetchVocabularyProgress } from '@/lib/data/progress'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { user, response } = await requireUser(supabase)
  if (!user) return response

  let data
  try {
    data = await fetchVocabularyProgress(supabase, user.id, Number(id))
  } catch (err) {
    return jsonError(500, err instanceof Error ? err.message : 'Failed to load vocabulary progress.')
  }

  if (!data) return jsonError(404, 'No progress found for this word.')

  return NextResponse.json(data)
}
