import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { jsonError, requireUser } from '@/lib/api/errors'
import { JLPT_LEVELS } from '@/lib/srs/constants'

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

  const { data, error } = await supabase.rpc('search_vocabulary', {
    p_query: search,
    p_level: levels,
    p_limit: limit,
    p_offset: offset,
  })

  if (error) {
    return jsonError(500, error.message)
  }

  const count = data[0]?.total_count ?? 0
  const rows = data.map((row: { total_count: number }) => {
    const { total_count, ...rest } = row
    void total_count
    return rest
  })

  return NextResponse.json({ data: rows, count, limit, offset })
}
