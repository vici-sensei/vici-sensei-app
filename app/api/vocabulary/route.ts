import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { jsonError, requireUser } from '@/lib/api/errors'
import { JLPT_LEVELS } from '@/lib/srs/constants'
import { fetchVocabularyList } from '@/lib/data/vocabulary'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 500

export async function GET(request: Request) {
  const supabase = await createClient()
  const { user, response } = await requireUser(supabase)
  if (!user) return response

  const { searchParams } = new URL(request.url)
  const levelParam = searchParams.get('level')
  const levels = levelParam
    ? levelParam.split(',').map((level) => level.trim()).filter(Boolean)
    : null
  const search = searchParams.get('search')?.trim() ?? null
  const limit = Math.min(Number(searchParams.get('limit')) || DEFAULT_LIMIT, MAX_LIMIT)
  const offset = Math.max(Number(searchParams.get('offset')) || 0, 0)

  if (levels?.some((level) => !JLPT_LEVELS.includes(level as (typeof JLPT_LEVELS)[number]))) {
    return jsonError(400, `each level must be one of: ${JLPT_LEVELS.join(', ')}`)
  }

  try {
    const result = await fetchVocabularyList({ search, levels, limit, offset })
    return NextResponse.json(result)
  } catch (err) {
    return jsonError(500, err instanceof Error ? err.message : 'Failed to search vocabulary.')
  }
}
