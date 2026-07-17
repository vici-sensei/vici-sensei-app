import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { jsonError } from '@/lib/api/errors'
import { JLPT_LEVELS } from '@/lib/srs/constants'

const DEFAULT_LIMIT = 50
const MAX_LIMIT = 500

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const level = searchParams.get('level')
  const search = searchParams.get('search')?.trim()
  const limit = Math.min(Number(searchParams.get('limit')) || DEFAULT_LIMIT, MAX_LIMIT)
  const offset = Math.max(Number(searchParams.get('offset')) || 0, 0)

  if (level && !JLPT_LEVELS.includes(level as (typeof JLPT_LEVELS)[number])) {
    return jsonError(400, `level must be one of: ${JLPT_LEVELS.join(', ')}`)
  }

  const supabase = await createClient()
  let query = supabase
    .from('kanji')
    .select('id, kanji, meanings, level, kun_readings, on_readings', { count: 'exact' })
    .order('id', { ascending: true })
    .range(offset, offset + limit - 1)

  if (level) query = query.eq('level', level)
  if (search) {
    // Substring match on the kanji character itself; exact-element match on meanings
    // as a fallback (PostgREST can't do a substring search inside a text[] column).
    query = query.or(`kanji.ilike.%${search}%,meanings.cs.{${search}}`)
  }

  const { data, error, count } = await query

  if (error) {
    return jsonError(500, error.message)
  }

  return NextResponse.json({ data, count, limit, offset })
}
