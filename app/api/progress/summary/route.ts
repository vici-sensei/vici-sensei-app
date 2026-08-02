import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { jsonError, requireUser } from '@/lib/api/errors'
import { fetchProgressSummary } from '@/lib/data/progress'

export async function GET() {
  const supabase = await createClient()
  const { user, response } = await requireUser(supabase)
  if (!user) return response

  try {
    const data = await fetchProgressSummary(supabase, user.id)
    return NextResponse.json(data)
  } catch (err) {
    return jsonError(500, err instanceof Error ? err.message : 'Failed to load progress summary.')
  }
}
