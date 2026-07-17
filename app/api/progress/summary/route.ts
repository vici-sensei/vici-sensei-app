import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { jsonError, requireUser } from '@/lib/api/errors'
import { PROGRESS_STATUSES } from '@/lib/srs/constants'

function countByStatus(rows: { status: string }[]) {
  const counts = Object.fromEntries(PROGRESS_STATUSES.map((s) => [s, 0])) as Record<string, number>
  for (const row of rows) {
    counts[row.status] = (counts[row.status] ?? 0) + 1
  }
  return counts
}

export async function GET() {
  const supabase = await createClient()
  const { user, response } = await requireUser(supabase)
  if (!user) return response

  const [meaning, reading, vocab] = await Promise.all([
    supabase.from('user_kanji_meaning_progress').select('status').eq('user_id', user.id),
    supabase.from('user_kanji_reading_progress').select('status').eq('user_id', user.id),
    supabase.from('user_vocabulary_progress').select('status').eq('user_id', user.id),
  ])

  if (meaning.error) return jsonError(500, meaning.error.message)
  if (reading.error) return jsonError(500, reading.error.message)
  if (vocab.error) return jsonError(500, vocab.error.message)

  return NextResponse.json({
    kanji_meaning: countByStatus(meaning.data),
    kanji_reading: countByStatus(reading.data),
    vocab_meaning: countByStatus(vocab.data),
  })
}
