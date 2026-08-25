import type { AppSupabaseClient } from "@/lib/supabase/types";
import { getNextDue } from "@/lib/srs/nextDue";
import { fetchKanjiDetailWordsBatch } from "@/lib/kanji/detailWords";
import { previewRatingLabels, type ProgressRow } from "@/lib/srs/scheduler";
import type {
  DueCard,
  KanjiRow,
  NewHiraganaCandidate,
  NewKanjiIntroWord,
  NewKatakanaCandidate,
  StudySettings,
  StudyQueueResponse,
  TodayActivityCounts,
} from "@/lib/types";

// Raw shape of a get_due_cards() row: DueCard's fields plus the SRS state columns
// (status/ease_factor/interval_days/repetitions/lapses/learning_step) that only
// exist to compute rating_previews here -- they never reach the caller as-is.
type DueCardRow = Omit<DueCard, "rating_previews"> & ProgressRow;

function toDueCard(row: DueCardRow): DueCard {
  const { ease_factor, interval_days, repetitions, lapses, learning_step, ...card } = row;
  return {
    ...card,
    rating_previews: previewRatingLabels({
      status: row.status,
      ease_factor,
      interval_days,
      repetitions,
      lapses,
      learning_step,
    }),
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
    p_include_hiragana: settings.study_hiragana,
    p_include_katakana: settings.study_katakana,
    p_limit: 1,
  });

  if (error) throw new Error(error.message);
  const row = ((data ?? []) as DueCardRow[])[0];
  return row ? toDueCard(row) : null;
}

/** Fetches the fresh hiragana_reading/katakana_reading cards for hiragana/katakana ids that
 * were just introduced (see introduce_hiragana/introduce_katakana, which set due_at = now()
 * for exactly this reason) -- called once a whole gojuon pack finishes introducing, so
 * useStudyQueue can prepend its reading cards as one block right behind it, instead of
 * waiting for the next poll/timer to pick them up via get_due_cards. Order follows `ids`
 * (the pack's gojuon order), not due_at, since every row here is equally due right now. */
export async function fetchHiraganaReadingCards(
  supabase: AppSupabaseClient,
  userId: string,
  ids: number[]
): Promise<DueCard[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.rpc("get_hiragana_reading_cards", {
    p_user_id: userId,
    p_hiragana_ids: ids,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as DueCardRow[]).map(toDueCard);
}

export async function fetchKatakanaReadingCards(
  supabase: AppSupabaseClient,
  userId: string,
  ids: number[]
): Promise<DueCard[]> {
  if (ids.length === 0) return [];
  const { data, error } = await supabase.rpc("get_katakana_reading_cards", {
    p_user_id: userId,
    p_katakana_ids: ids,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as DueCardRow[]).map(toDueCard);
}

export async function fetchStudyQueue(
  supabase: AppSupabaseClient,
  userId: string,
  timezone: string | undefined,
  settings: StudySettings,
  // New-kanji intro cards aren't shown until several cards into the session, so their example
  // words don't need to hold up the queue's first paint -- called (fire-and-forget, no error
  // surfaced) once the batch resolves, letting the caller patch its already-rendered queue.
  onKanjiWordsReady?: (wordsByKanjiId: Map<number, NewKanjiIntroWord[]>) => void
): Promise<StudyQueueResponse> {
  const enabledLevels = settings.enabled_levels as string[];

  const [dueCardsResult, nextDue, activityCounts, userFlagsResult] = await Promise.all([
    supabase.rpc("get_due_cards", {
      p_user_id: userId,
      p_enabled_levels: enabledLevels,
      p_include_kanji: settings.study_kanji,
      p_include_vocab: settings.study_vocabulary,
      p_include_hiragana: settings.study_hiragana,
      p_include_katakana: settings.study_katakana,
      p_limit: settings.max_reviews_per_day,
    }),
    getNextDue(supabase, userId, timezone),
    supabase.rpc("get_today_activity_counts", { p_user_id: userId, p_timezone: timezone ?? "UTC" }).single(),
    supabase.from("users").select("undo_disabled").eq("id", userId).single(),
  ]);

  if (dueCardsResult.error) throw new Error(dueCardsResult.error.message);
  if (nextDue.error !== null) throw new Error(nextDue.error);
  if (activityCounts.error) throw new Error(activityCounts.error.message);
  if (userFlagsResult.error) throw new Error(userFlagsResult.error.message);

  const counts = activityCounts.data as TodayActivityCounts;
  const kanjiRemaining = settings.study_kanji ? Math.max(settings.new_kanji_per_day - counts.new_kanji_today, 0) : 0;
  const vocabRemaining = settings.study_vocabulary ? Math.max(settings.new_vocab_per_day - counts.new_vocab_today, 0) : 0;
  const hiraganaRemaining = settings.study_hiragana
    ? Math.max(settings.new_hiragana_per_day - counts.new_hiragana_today, 0)
    : 0;
  const katakanaRemaining = settings.study_katakana
    ? Math.max(settings.new_katakana_per_day - counts.new_katakana_today, 0)
    : 0;

  const [kanjiCandidatesResult, vocabCandidatesResult, hiraganaCandidatesResult, katakanaCandidatesResult] = await Promise.all([
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
    hiraganaRemaining > 0
      ? supabase.rpc("get_new_hiragana_candidates", { p_user_id: userId, p_limit: hiraganaRemaining })
      : Promise.resolve({ data: [] as NewHiraganaCandidate[], error: null }),
    katakanaRemaining > 0
      ? supabase.rpc("get_new_katakana_candidates", { p_user_id: userId, p_limit: katakanaRemaining })
      : Promise.resolve({ data: [] as NewKatakanaCandidate[], error: null }),
  ]);

  if (kanjiCandidatesResult.error) throw new Error(kanjiCandidatesResult.error.message);
  if (vocabCandidatesResult.error) throw new Error(vocabCandidatesResult.error.message);
  if (hiraganaCandidatesResult.error) throw new Error(hiraganaCandidatesResult.error.message);
  if (katakanaCandidatesResult.error) throw new Error(katakanaCandidatesResult.error.message);

  const kanjiCandidateRows = (kanjiCandidatesResult.data ?? []) as KanjiRow[];
  if (kanjiCandidateRows.length > 0 && onKanjiWordsReady) {
    void fetchKanjiDetailWordsBatch(supabase, kanjiCandidateRows.map((c) => c.id)).then(
      ({ wordsByKanjiId, error: wordsError }) => {
        if (!wordsError) onKanjiWordsReady(wordsByKanjiId);
        // Errors here just mean the intro cards show with no example words -- not worth
        // throwing over, since by the time this resolves the queue is already on screen.
      }
    );
  }

  const newKanjiToIntroduce = kanjiCandidateRows.map((candidate) => ({
    ...candidate,
    words: [] as NewKanjiIntroWord[],
  }));

  return {
    due_cards: ((dueCardsResult.data ?? []) as DueCardRow[]).map(toDueCard),
    new_kanji_to_introduce: newKanjiToIntroduce,
    new_vocab_to_introduce: vocabCandidatesResult.data ?? [],
    new_hiragana_to_introduce: hiraganaCandidatesResult.data ?? [],
    new_katakana_to_introduce: katakanaCandidatesResult.data ?? [],
    next_due_at: nextDue.data.next_due_at,
    undo_disabled: userFlagsResult.data?.undo_disabled ?? false,
  };
}
