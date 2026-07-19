import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { jsonError, requireUser } from '@/lib/api/errors'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { user, response } = await requireUser(supabase)
  if (!user) return response

  const { data, error } = await supabase.from('vocabulary').select('*').eq('id', id).maybeSingle()

  if (error) {
    return jsonError(500, error.message)
  }
  if (!data) {
    return jsonError(404, 'Vocabulary word not found.')
  }

  return NextResponse.json(data)
}
