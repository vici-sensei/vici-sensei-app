import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'

export function jsonError(status: number, message: string) {
  return NextResponse.json({ error: message }, { status })
}

export async function requireUser(supabase: SupabaseClient) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser()

  if (error || !user) {
    return { user: null, response: jsonError(401, 'You are not logged in. Please log in.') }
  }

  return { user, response: null }
}
