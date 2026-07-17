import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { jsonError, requireUser } from '@/lib/api/errors'
import { CARD_TYPE_TO_EXERCISE_TYPE, PROGRESS_TABLES, type CardType } from '@/lib/srs/progressTables'

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ type: string; id: string }> }
) {
  const { type, id } = await params

  if (!(type in CARD_TYPE_TO_EXERCISE_TYPE)) {
    return jsonError(400, `type must be one of: ${Object.keys(CARD_TYPE_TO_EXERCISE_TYPE).join(', ')}`)
  }

  const supabase = await createClient()
  const { user, response } = await requireUser(supabase)
  if (!user) return response

  const { table, key } = PROGRESS_TABLES[CARD_TYPE_TO_EXERCISE_TYPE[type as CardType]]

  const { data, error } = await supabase
    .from(table)
    .update({ status: 'suspended', updated_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .eq(key, id)
    .select('*')
    .maybeSingle()

  if (error) return jsonError(500, error.message)
  if (!data) return jsonError(404, 'No progress found for this card.')

  return NextResponse.json(data)
}
