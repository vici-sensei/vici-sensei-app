import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { jsonError, requireUser } from '@/lib/api/errors'

export async function POST() {
  const supabase = await createClient()
  const { user, response } = await requireUser(supabase)
  if (!user) return response

  const { data, error } = await supabase
    .from('study_sessions')
    .insert({ user_id: user.id })
    .select('id, started_at')
    .single()

  if (error) return jsonError(500, error.message)

  return NextResponse.json({ session_id: data.id, started_at: data.started_at }, { status: 201 })
}
