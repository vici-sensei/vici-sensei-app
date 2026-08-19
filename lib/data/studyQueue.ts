import type { AppSupabaseClient } from "@/lib/supabase/types";
import { utcDayBounds } from "@/lib/srs/day";
import { getNextDue } from "@/lib/srs/nextDue";
import { fetchKanjiDetailWordsBatch } from "@/lib/kanji/detailWords";
import { previewRatingLabels, type ProgressRow } from "@/lib/srs/scheduler";
import type { DueCard, KanjiRow, StudySettings, StudyQueueResponse } from "@/lib/types";

// Raw shape of a get_due_cards() row: DueCard's fields plus the SRS state columns
// (status/ease_factor/interval_days/repetitions/lapses/learning_step) that only
// exist to compute rating_previews here -- they never reach the caller as-is.
type DueCardRow = Omit<DueCard, "rating_previews"> & ProgressRow;

function toDueCard(row: DueCardRow): DueCard {
  const { status, ease_factor, interval_days, repetitions, lapses, learning_step, ...card } = row;
  return {
    ...card,
    rating_previews: previewRatingLabels({ status, ease_factor, interval_days, repetitions, lapses, learning_step }),
  };
}

/** Just enough to render the very first card the user sees: one due card, nothing else --
 * no next-due time, no new-material candidates, no daily counts. `fetchStudyQueue` fetches
 * the real queue in parallel/background and merges it in without disturbing this card once
 * it's on screen. `settings` is the caller's already-loaded copy (StudyLayout only renders
 * once onboarding settings are fetched), so this is a single round trip, not two. */
export async function fetchFirstDueCard(
  supabase: AppSupabaseClient,
  userId: string,
  settings: StudySettings
): Promise<DueCard | null> {
  const { data, error } = await supabase.rpc("get_due_cards", {
    p_user_id: userId,
    p_enabled_levels: settings.enabled_levels as string[],
    p_include_kanji: settings.study_kanji,
    p_include_vocab: settings.study_vocabulary,
    p_limit: 1,
    p_as_of: new Date().toISOString(),
  });

  if (error) throw new Error(error.message);
  const row = ((data ?? []) as DueCardRow[])[0];
  return row ? toDueCard(row) : null;
}

export async function fetchStudyQueue(
  supabase: AppSupabaseClient,
  userId: string,
  timezone: string | undefined,
  settings: StudySettings
): Promise<StudyQueueResponse> {
  const enabledLevels = settings.enabled_levels as string[];
  const nowIso = new Date().toISOString();
  const { start: todayStart, end: todayEnd } = utcDayBounds(new Date(), timezone);

  const [dueCardsResult, nextDue, kanjiCountResult, vocabCountResult, userFlagsResult] = await Promise.all([
    supabase.rpc("get_due_cards", {
      p_user_id: userId,
      p_enabled_levels: enabledLevels,
      p_include_kanji: settings.study_kanji,
      p_include_vocab: settings.study_vocabulary,
      p_limit: settings.max_reviews_per_day,
      p_as_of: nowIso,
    }),
    getNextDue(supabase, userId, nowIso, timezone),
    settings.study_kanji
      ? supabase
          .from("user_kanji_meaning_progress")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("repetitions", 0)
          .gte("created_at", todayStart)
          .lt("created_at", todayEnd)
      : Promise.resolve({ count: 0, error: null }),
    settings.study_vocabulary
      ? supabase
          .from("user_vocabulary_progress")
          .select("id", { count: "exact", head: true })
          .eq("user_id", userId)
          .eq("repetitions", 0)
          .gte("created_at", todayStart)
          .lt("created_at", todayEnd)
      : Promise.resolve({ count: 0, error: null }),
    supabase.from("users").select("undo_disabled").eq("id", userId).single(),
  ]);

  if (dueCardsResult.error) throw new Error(dueCardsResult.error.message);
  if (nextDue.error !== null) throw new Error(nextDue.error);
  if (kanjiCountResult.error) throw new Error(kanjiCountResult.error.message);
  if (vocabCountResult.error) throw new Error(vocabCountResult.error.message);
  if (userFlagsResult.error) throw new Error(userFlagsResult.error.message);

  const kanjiRemaining = settings.study_kanji
    ? Math.max(settings.new_kanji_per_day - (kanjiCountResult.count ?? 0), 0)
    : 0;
  const vocabRemaining = settings.study_vocabulary
    ? Math.max(settings.new_vocab_per_day - (vocabCountResult.count ?? 0), 0)
    : 0;

  const [kanjiCandidatesResult, vocabCandidatesResult] = await Promise.all([
    kanjiRemaining > 0
      ? supabase.rpc("get_new_kanji_candidates", {
          p_user_id: userId,
          p_enabled_levels: enabledLevels,
          p_limit: kanjiRemaining,
        })
      : Promise.resolve({ data: [] as KanjiRow[], error: null }),
    vocabRemaining > 0
      ? supabase.rpc("get_new_vocab_candidates", {
          p_user_id: userId,
          p_enabled_levels: enabledLevels,
          p_limit: vocabRemaining,
        })
      : Promise.resolve({ data: [] as unknown[], error: null }),
  ]);

  if (kanjiCandidatesResult.error) throw new Error(kanjiCandidatesResult.error.message);
  if (vocabCandidatesResult.error) throw new Error(vocabCandidatesResult.error.message);

  const kanjiCandidateRows = (kanjiCandidatesResult.data ?? []) as KanjiRow[];
  const { wordsByKanjiId, error: wordsError } = await fetchKanjiDetailWordsBatch(
    supabase,
    kanjiCandidateRows.map((c) => c.id)
  );
  if (wordsError) throw new Error(wordsError);

  const newKanjiToIntroduce = kanjiCandidateRows.map((candidate) => ({
    ...candidate,
    words: wordsByKanjiId.get(candidate.id) ?? [],
  }));

  return {
    due_cards: ((dueCardsResult.data ?? []) as DueCardRow[]).map(toDueCard),
    new_kanji_to_introduce: newKanjiToIntroduce,
    new_vocab_to_introduce: vocabCandidatesResult.data ?? [],
    next_due_at: nextDue.data.next_due_at,
    undo_disabled: userFlagsResult.data?.undo_disabled ?? false,
  };
}
