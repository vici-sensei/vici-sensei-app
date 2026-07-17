import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { jsonError } from '@/lib/api/errors'

export async function GET() {
  const supabase = await createClient()
  const { error } = await supabase.from('users').select('id').limit(1)

  if (error) {
    return jsonError(500, `Database connectivity check failed: ${error.message}`)
  }

  return NextResponse.json({ status: 'ok' })
}
