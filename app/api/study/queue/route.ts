import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { jsonError, requireUser } from '@/lib/api/errors'
import { utcDayBounds } from '@/lib/srs/day'
import { getNextDue } from '@/lib/srs/nextDue'
import { fetchKanjiDetailWordsBatch } from '@/lib/kanji/detailWords'
import type { KanjiRow } from '@/lib/types'

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
  const { start: todayStart, end: todayEnd } = utcDayBounds()

  // Everything below only depends on `settings`, so it fires as batches of parallel queries
  // instead of the sequential round trips this route used to make one at a time — each round
  // trip pays full cross-region latency, so this cuts request time roughly in proportion to
  // the number of rounds saved (was ~6-7 sequential, now 3 at most).
  const [dueCardsResult, nextDue, kanjiCountResult, vocabCountResult] = await Promise.all([
    supabase.rpc('get_due_cards', {
      p_user_id: user.id,
      p_enabled_levels: enabledLevels,
      p_include_kanji: settings.study_kanji,
      p_include_vocab: settings.study_vocabulary,
      p_limit: settings.max_reviews_per_day,
      p_as_of: nowIso,
    }),
    getNextDue(supabase, user.id, nowIso),
    settings.study_kanji
      ? supabase
          .from('user_kanji_meaning_progress')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('repetitions', 0)
          .gte('created_at', todayStart)
          .lt('created_at', todayEnd)
      : Promise.resolve({ count: 0, error: null }),
    settings.study_vocabulary
      ? supabase
          .from('user_vocabulary_progress')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('repetitions', 0)
          .gte('created_at', todayStart)
          .lt('created_at', todayEnd)
      : Promise.resolve({ count: 0, error: null }),
  ])

  if (dueCardsResult.error) return jsonError(500, dueCardsResult.error.message)
  if (nextDue.error !== null) return jsonError(500, nextDue.error)
  if (kanjiCountResult.error) return jsonError(500, kanjiCountResult.error.message)
  if (vocabCountResult.error) return jsonError(500, vocabCountResult.error.message)

  const kanjiRemaining = settings.study_kanji
    ? Math.max(settings.new_kanji_per_day - (kanjiCountResult.count ?? 0), 0)
    : 0
  const vocabRemaining = settings.study_vocabulary
    ? Math.max(settings.new_vocab_per_day - (vocabCountResult.count ?? 0), 0)
    : 0

  const [kanjiCandidatesResult, vocabCandidatesResult] = await Promise.all([
    kanjiRemaining > 0
      ? supabase.rpc('get_new_kanji_candidates', {
          p_user_id: user.id,
          p_enabled_levels: enabledLevels,
          p_limit: kanjiRemaining,
        })
      : Promise.resolve({ data: [] as KanjiRow[], error: null }),
    vocabRemaining > 0
      ? supabase.rpc('get_new_vocab_candidates', {
          p_user_id: user.id,
          p_enabled_levels: enabledLevels,
          p_limit: vocabRemaining,
        })
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ])

  if (kanjiCandidatesResult.error) return jsonError(500, kanjiCandidatesResult.error.message)
  if (vocabCandidatesResult.error) return jsonError(500, vocabCandidatesResult.error.message)

  const kanjiCandidateRows = (kanjiCandidatesResult.data ?? []) as KanjiRow[]
  const { wordsByKanjiId, error: wordsError } = await fetchKanjiDetailWordsBatch(
    supabase,
    kanjiCandidateRows.map((c) => c.id)
  )
  if (wordsError) return jsonError(500, wordsError)

  const newKanjiToIntroduce = kanjiCandidateRows.map((candidate) => ({
    ...candidate,
    words: wordsByKanjiId.get(candidate.id) ?? [],
  }))

  return NextResponse.json({
    due_cards: dueCardsResult.data,
    new_kanji_to_introduce: newKanjiToIntroduce,
    new_vocab_to_introduce: vocabCandidatesResult.data ?? [],
    next_due_at: nextDue.data.next_due_at,
  })
}
