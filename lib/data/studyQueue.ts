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
  NewVocabCandidate,
  StudySettings,
  StudyQueueResponse,
  TodayActivityCounts,
} from "@/lib/types";

// get_new_kanji_candidates' row shape: KanjiRow plus word_count (see
// 20260831_predicted_daily_total.sql) -- how many kanji_reading cards this candidate will
// produce once introduced, known up front from kanji_detail_words alone, independent of the
// word *content* fetchKanjiDetailWordsBatch fetches separately/lazily below.
type NewKanjiCandidateRow = KanjiRow & { word_count: number };

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

/** Fetches the kanji_meaning + kanji_reading cards for a kanji that was just introduced (see
 * introduce_kanji, which sets due_at = now() for both on insert for exactly this reason) --
 * called once introduce_kanji resolves, so useStudyQueue can hand the whole bundle
 * (meaning card, then its Word reading cards) straight to the queue as one block instead of
 * waiting for the next poll/timer to pick them up via get_due_cards. Order is meaning first,
 * then readings in kanji_detail_words rank order -- the caller shuffles the readings itself. */
export async function fetchKanjiIntroCards(
  supabase: AppSupabaseClient,
  userId: string,
  kanjiId: number
): Promise<DueCard[]> {
  const { data, error } = await supabase.rpc("get_kanji_intro_cards", {
    p_user_id: userId,
    p_kanji_id: kanjiId,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as DueCardRow[]).map(toDueCard);
}

/** Atomically releases every one of this user's still-pending vocab_meaning rows (see
 * introduce_vocabulary, which inserts new words with pending_batch = true specifically so
 * get_due_cards can never surface them early, no matter how much time passes) and returns
 * exactly the rows it just released. Called both right when useStudyQueue detects the last
 * "New vocabulary" card in the queue was just introduced, and opportunistically from
 * fetchStudyQueue below whenever there are no New vocabulary candidates left at all -- so a
 * batch left half-finished in an earlier session gets flushed the moment the queue is next
 * loaded, instead of staying stuck. The UPDATE...RETURNING in complete_vocab_batch means a
 * concurrent caller (another tab, or this same flush racing the same-session hand-off) can
 * never receive the same row twice -- whichever transaction commits first captures it. */
export async function fetchCompleteVocabBatch(supabase: AppSupabaseClient, userId: string): Promise<DueCard[]> {
  const { data, error } = await supabase.rpc("complete_vocab_batch", { p_user_id: userId });
  if (error) throw new Error(error.message);
  return ((data ?? []) as DueCardRow[]).map(toDueCard);
}

// The whole day's card count, predicted before any of the not-yet-created future cards exist:
// every already-due review counts as 1, and every New candidate counts as itself PLUS the
// review card(s) introducing it is guaranteed to produce -- 1 (the New kanji card itself) + 1
// (Kanji meaning) + word_count (Word reading) for a kanji, or a flat 2 (the New card itself +
// its one future review card) for vocab/hiragana/katakana, each of which has exactly one future
// review card per candidate (get_kanji_intro_cards, complete_vocab_batch,
// get_hiragana/katakana_reading_cards all confirm this 1:1 relationship). See
// 20260831_predicted_daily_total.sql for why this is knowable without creating anything.
function computePredictedTotal(
  dueCardCount: number,
  kanjiCandidates: NewKanjiCandidateRow[],
  vocabCandidateCount: number,
  hiraganaCandidateCount: number,
  katakanaCandidateCount: number
): number {
  const kanjiTotal = kanjiCandidates.reduce((sum, c) => sum + 2 + c.word_count, 0);
  return dueCardCount + kanjiTotal + vocabCandidateCount * 2 + hiraganaCandidateCount * 2 + katakanaCandidateCount * 2;
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
      : Promise.resolve({ data: [] as NewKanjiCandidateRow[], error: null }),
    vocabRemaining > 0
      ? supabase.rpc("get_new_vocab_candidates", {
          p_user_id: userId,
          p_enabled_levels: enabledLevels,
          p_limit: vocabRemaining,
        })
      : Promise.resolve({ data: [] as NewVocabCandidate[], error: null }),
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

  const kanjiCandidateRows = (kanjiCandidatesResult.data ?? []) as NewKanjiCandidateRow[];
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

  const dueCards = ((dueCardsResult.data ?? []) as DueCardRow[]).map(toDueCard);

  // No New vocabulary candidates left to show at all (today's quota used up, or -- rarer -- the
  // level simply ran out of unseen words before the quota did) -- either way, nothing will ever
  // trigger useStudyQueue's own "last card in the batch" hand-off again, so flush any words
  // still pending_batch here instead. Harmless no-op when nothing is pending (a fresh
  // UPDATE...RETURNING with zero matching rows), so this is safe to run on every fetch. Can
  // never duplicate a row already in dueCards above: get_due_cards excludes pending_batch rows
  // outright, and complete_vocab_batch only ever returns rows that were still pending_batch at
  // the moment of its own UPDATE -- the two sets are disjoint by construction.
  if (settings.study_vocabulary && (vocabCandidatesResult.data ?? []).length === 0) {
    const flushed = await fetchCompleteVocabBatch(supabase, userId).catch(() => [] as DueCard[]);
    dueCards.push(...flushed);
  }

  const vocabCandidates = (vocabCandidatesResult.data ?? []) as NewVocabCandidate[];
  const hiraganaCandidates = (hiraganaCandidatesResult.data ?? []) as NewHiraganaCandidate[];
  const katakanaCandidates = (katakanaCandidatesResult.data ?? []) as NewKatakanaCandidate[];

  return {
    due_cards: dueCards,
    new_kanji_to_introduce: newKanjiToIntroduce,
    new_vocab_to_introduce: vocabCandidates,
    new_hiragana_to_introduce: hiraganaCandidates,
    new_katakana_to_introduce: katakanaCandidates,
    next_due_at: nextDue.data.next_due_at,
    next_due_status: nextDue.data.next_due_status,
    undo_disabled: userFlagsResult.data?.undo_disabled ?? false,
    predicted_total: computePredictedTotal(
      dueCards.length,
      kanjiCandidateRows,
      vocabCandidates.length,
      hiraganaCandidates.length,
      katakanaCandidates.length
    ),
  };
}
