import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { jsonError, requireUser } from '@/lib/api/errors'
import { fetchVocabularyDetail } from '@/lib/data/vocabulary'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { user, response } = await requireUser(supabase)
  if (!user) return response

  let data
  try {
    data = await fetchVocabularyDetail(Number(id))
  } catch (err) {
    return jsonError(500, err instanceof Error ? err.message : 'Failed to load vocabulary word.')
  }

  if (!data) {
    return jsonError(404, 'Vocabulary word not found.')
  }

  return NextResponse.json(data)
}
