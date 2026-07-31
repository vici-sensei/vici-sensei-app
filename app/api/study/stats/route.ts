import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { jsonError, requireUser } from '@/lib/api/errors'
import { utcDayBounds } from '@/lib/srs/day'
import { getNextDue } from '@/lib/srs/nextDue'

const DEFAULT_NEW_KANJI_PER_DAY = 2
const DEFAULT_NEW_VOCAB_PER_DAY = 12
const RETENTION_WINDOW_DAYS = 30

export async function GET() {
  const supabase = await createClient()
  const { user, response } = await requireUser(supabase)
  if (!user) return response

  const { data: settings } = await supabase
    .from('user_study_settings')
    .select('new_kanji_per_day, new_vocab_per_day')
    .eq('user_id', user.id)
    .maybeSingle()

  const newKanjiPerDay = settings?.new_kanji_per_day ?? DEFAULT_NEW_KANJI_PER_DAY
  const newVocabPerDay = settings?.new_vocab_per_day ?? DEFAULT_NEW_VOCAB_PER_DAY

  const nowIso = new Date().toISOString()
  const { start: todayStart, end: todayEnd } = utcDayBounds()

  const dueCounters = await Promise.all(
    (['user_kanji_meaning_progress', 'user_kanji_reading_progress', 'user_vocabulary_progress'] as const).map(
      (table) =>
        supabase
          .from(table)
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .lte('due_at', nowIso)
          .neq('status', 'suspended')
    )
  )
  for (const result of dueCounters) {
    if (result.error) return jsonError(500, result.error.message)
  }
  const dueToday = dueCounters.reduce((sum, r) => sum + (r.count ?? 0), 0)

  const nextDue = await getNextDue(supabase, user.id, nowIso)
  if (nextDue.error !== null) return jsonError(500, nextDue.error)
  const { next_due_at: nextDueAt, next_due_is_today: nextDueIsToday } = nextDue.data

  const { count: newKanjiToday, error: newKanjiError } = await supabase
    .from('user_kanji_meaning_progress')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('repetitions', 0)
    .gte('created_at', todayStart)
    .lt('created_at', todayEnd)
  if (newKanjiError) return jsonError(500, newKanjiError.message)

  const { count: newVocabToday, error: newVocabError } = await supabase
    .from('user_vocabulary_progress')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('repetitions', 0)
    .gte('created_at', todayStart)
    .lt('created_at', todayEnd)
  if (newVocabError) return jsonError(500, newVocabError.message)

  const windowStart = new Date(Date.now() - RETENTION_WINDOW_DAYS * 86_400_000).toISOString()
  const { data: recentLogs, error: recentLogsError } = await supabase
    .from('review_logs')
    .select('correct, reviewed_at')
    .eq('user_id', user.id)
    .eq('undone', false)
    .gte('reviewed_at', windowStart)

  if (recentLogsError) return jsonError(500, recentLogsError.message)

  const retentionRate =
    recentLogs.length > 0 ? recentLogs.filter((log) => log.correct).length / recentLogs.length : null

  // Computed via a Postgres function rather than app-side, so it isn't
  // limited to the same window used for retention_rate above.
  const { data: streak, error: streakError } = await supabase.rpc('get_review_streak', {
    p_user_id: user.id,
  })
  if (streakError) return jsonError(500, streakError.message)

  return NextResponse.json({
    due_today: dueToday,
    new_kanji_today: newKanjiToday ?? 0,
    new_kanji_limit: newKanjiPerDay,
    new_vocab_today: newVocabToday ?? 0,
    new_vocab_limit: newVocabPerDay,
    streak,
    retention_rate: retentionRate,
    next_due_at: nextDueAt,
    next_due_is_today: nextDueIsToday,
  })
}
