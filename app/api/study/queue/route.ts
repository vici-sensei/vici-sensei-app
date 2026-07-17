import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { jsonError, requireUser } from '@/lib/api/errors'
import { utcDayBounds } from '@/lib/srs/day'

interface DueCard {
  exercise_type: 'kanji_meaning' | 'kanji_reading' | 'vocab_meaning'
  due_at: string
  [key: string]: unknown
}

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
  const dueCards: DueCard[] = []

  if (settings.study_kanji) {
    const { data: meaningDue, error: meaningError } = await supabase
      .from('user_kanji_meaning_progress')
      .select(
        'id, kanji_id, status, due_at, ease_factor, interval_days, repetitions, lapses, learning_step, kanji:kanji_id!inner(kanji, meanings, level)'
      )
      .eq('user_id', user.id)
      .lte('due_at', nowIso)
      .neq('status', 'suspended')
      .in('kanji.level', enabledLevels)

    if (meaningError) return jsonError(500, meaningError.message)
    dueCards.push(...meaningDue.map((row) => ({ ...row, exercise_type: 'kanji_meaning' as const })))

    const { data: readingDue, error: readingError } = await supabase
      .from('user_kanji_reading_progress')
      .select(
        'id, kanji_id, kanji_word_id, status, due_at, ease_factor, interval_days, repetitions, lapses, learning_step, kanji_word:kanji_word_id!inner(level, reading_number, vocabulary:id_word(word, kana_reading))'
      )
      .eq('user_id', user.id)
      .lte('due_at', nowIso)
      .neq('status', 'suspended')
      .in('kanji_word.level', enabledLevels)

    if (readingError) return jsonError(500, readingError.message)
    dueCards.push(...readingDue.map((row) => ({ ...row, exercise_type: 'kanji_reading' as const })))
  }

  if (settings.study_vocabulary) {
    const { data: vocabDue, error: vocabError } = await supabase
      .from('user_vocabulary_progress')
      .select(
        'id, word_id, status, due_at, ease_factor, interval_days, repetitions, lapses, learning_step, vocabulary:word_id!inner(word, kana_reading, jlpt_level)'
      )
      .eq('user_id', user.id)
      .lte('due_at', nowIso)
      .neq('status', 'suspended')
      .in('vocabulary.jlpt_level', enabledLevels)

    if (vocabError) return jsonError(500, vocabError.message)
    dueCards.push(...vocabDue.map((row) => ({ ...row, exercise_type: 'vocab_meaning' as const })))
  }

  dueCards.sort((a, b) => new Date(a.due_at).getTime() - new Date(b.due_at).getTime())
  const limitedDueCards = dueCards.slice(0, settings.max_reviews_per_day)

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
      const { data: existingIds, error: existingError } = await supabase
        .from('user_kanji_meaning_progress')
        .select('kanji_id')
        .eq('user_id', user.id)

      if (existingError) return jsonError(500, existingError.message)

      let candidateQuery = supabase
        .from('kanji')
        .select('id, kanji, meanings, level, kun_readings, on_readings')
        .in('level', enabledLevels)
        .order('id', { ascending: true })
        .limit(remaining)

      const excludedIds = existingIds.map((row) => row.kanji_id)
      if (excludedIds.length > 0) {
        candidateQuery = candidateQuery.not('id', 'in', `(${excludedIds.join(',')})`)
      }

      const { data: candidates, error: candidatesError } = await candidateQuery
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
      const { data: existingIds, error: existingError } = await supabase
        .from('user_vocabulary_progress')
        .select('word_id')
        .eq('user_id', user.id)

      if (existingError) return jsonError(500, existingError.message)

      let candidateQuery = supabase
        .from('vocabulary')
        .select('*')
        .in('jlpt_level', enabledLevels)
        .order('priority_score', { ascending: false, nullsFirst: false })
        .limit(remaining)

      const excludedIds = existingIds.map((row) => row.word_id)
      if (excludedIds.length > 0) {
        candidateQuery = candidateQuery.not('id', 'in', `(${excludedIds.join(',')})`)
      }

      const { data: candidates, error: candidatesError } = await candidateQuery
      if (candidatesError) return jsonError(500, candidatesError.message)
      newVocabToIntroduce = candidates
    }
  }

  return NextResponse.json({
    due_cards: limitedDueCards,
    new_kanji_to_introduce: newKanjiToIntroduce,
    new_vocab_to_introduce: newVocabToIntroduce,
  })
}
