import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { jsonError, requireUser } from '@/lib/api/errors'
import { utcDayBounds } from '@/lib/srs/day'

export async function GET() {
  const supabase = await createClient()
  const { user, response } = await requireUser(supabase)
  if (!user) return response

  const { data: settings, error: settingsError } = await supabase
    .from('user_study_settings')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle()

  if (settingsError) {
    return jsonError(500, settingsError.message)
  }
  if (!settings) {
    return jsonError(404, 'No study settings found. Complete onboarding first.')
  }

  const enabledLevels = settings.enabled_levels as string[]
  const nowIso = new Date().toISOString()

  const { data: dueCards, error: dueError } = await supabase.rpc('get_due_cards', {
    p_user_id: user.id,
    p_enabled_levels: enabledLevels,
    p_include_kanji: settings.study_kanji,
    p_include_vocab: settings.study_vocabulary,
    p_limit: settings.max_reviews_per_day,
    p_as_of: nowIso,
  })
  if (dueError) return jsonError(500, dueError.message)

  const { start: todayStart, end: todayEnd } = utcDayBounds()
  let newKanjiToIntroduce: unknown[] = []
  let newVocabToIntroduce: unknown[] = []

  if (settings.study_kanji) {
    const { count: introducedTodayCount, error: countError } = await supabase
      .from('user_kanji_meaning_progress')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('repetitions', 0)
      .gte('created_at', todayStart)
      .lt('created_at', todayEnd)

    if (countError) return jsonError(500, countError.message)

    const remaining = Math.max(settings.new_kanji_per_day - (introducedTodayCount ?? 0), 0)
    if (remaining > 0) {
      const { data: candidates, error: candidatesError } = await supabase.rpc(
        'get_new_kanji_candidates',
        { p_user_id: user.id, p_enabled_levels: enabledLevels, p_limit: remaining }
      )
      if (candidatesError) return jsonError(500, candidatesError.message)
      newKanjiToIntroduce = candidates
    }
  }

  if (settings.study_vocabulary) {
    const { count: introducedTodayCount, error: countError } = await supabase
      .from('user_vocabulary_progress')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('repetitions', 0)
      .gte('created_at', todayStart)
      .lt('created_at', todayEnd)

    if (countError) return jsonError(500, countError.message)

    const remaining = Math.max(settings.new_vocab_per_day - (introducedTodayCount ?? 0), 0)
    if (remaining > 0) {
      const { data: candidates, error: candidatesError } = await supabase.rpc(
        'get_new_vocab_candidates',
        { p_user_id: user.id, p_enabled_levels: enabledLevels, p_limit: remaining }
      )
      if (candidatesError) return jsonError(500, candidatesError.message)
      newVocabToIntroduce = candidates
    }
  }

  return NextResponse.json({
    due_cards: dueCards,
    new_kanji_to_introduce: newKanjiToIntroduce,
    new_vocab_to_introduce: newVocabToIntroduce,
  })
}
