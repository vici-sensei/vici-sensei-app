import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { jsonError, requireUser } from '@/lib/api/errors'
import { fetchStudyStats } from '@/lib/data/studyStats'
import { getRequestTimezone } from '@/lib/data/timezone'

export async function GET() {
  const supabase = await createClient()
  const { user, response } = await requireUser(supabase)
  if (!user) return response

  try {
    const timezone = await getRequestTimezone()
    const stats = await fetchStudyStats(supabase, user.id, timezone)
    return NextResponse.json(stats)
  } catch (err) {
    return jsonError(500, err instanceof Error ? err.message : 'Failed to load study stats.')
  }
}
