import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { jsonError, requireUser } from '@/lib/api/errors'

export async function POST() {
  const supabase = await createClient()
  const { user, response } = await requireUser(supabase)
  if (!user) return response

  const { error } = await supabase.auth.signOut()
  if (error) {
    return jsonError(500, error.message)
  }

  return NextResponse.json({ message: 'Logged out successfully.' })
}
