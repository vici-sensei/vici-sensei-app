import type { AppSupabaseClient } from "@/lib/supabase/types";
import { getNextDue } from "@/lib/srs/nextDue";
import { fetchKanjiDetailWordsBatch } from "@/lib/kanji/detailWords";
import { previewRatingLabels, type ProgressRow } from "@/lib/srs/scheduler";
import { computeTotalCardsToday } from "@/lib/study/totalCardsToday";
import type {
  DueCard,
  KanjiRow,
  NewHiraganaCandidate,
  NewHiraganaRuleCandidate,
  NewKanjiIntroWord,
  NewKatakanaCandidate,
  NewKatakanaRuleCandidate,
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

// get_new_hiragana_candidates/get_new_katakana_candidates' raw row shape: the public
// NewHiraganaCandidate/NewKatakanaCandidate fields plus entry_kind, which only exists so
// fetchStudyQueue below can split each gojuon_row pack into character rows (rendered as a
// new_hiragana/new_katakana intro card, same as before) vs example rows (batch-introduced
// silently -- see introduceHiraganaExamples/introduceKatakanaExamples,
// 20260906_kana_examples_skip_intro_card.sql) before either ever reaches the client.
type NewHiraganaCandidateRow = NewHiraganaCandidate & { entry_kind: "character" | "example" };
type NewKatakanaCandidateRow = NewKatakanaCandidate & { entry_kind: "character" | "example" };

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

// Introduces whichever entry_kind = 'example' hiragana/katakana rows are actually due today (see
// introduce_hiragana_examples/introduce_katakana_examples, 20260902_harden_new_card_introduction.sql)
// -- these ids never get their own new_hiragana/new_katakana intro card (their content is already
// shown, all at once, on their kana_type's new_rule card), so fetchStudyQueue calls this whenever it
// sees any example candidates in this fetch, then immediately fetches their fresh reading cards
// below so they arrive as ordinary due_cards from the very first render -- no visible intro step,
// and no per-item round trip even for a pack as large as chōonpu's 44. Deliberately takes no id list
// -- the database re-derives exactly what's eligible and how much fits under today's remaining
// new_hiragana_per_day/new_katakana_per_day budget itself, so this can never introduce more (or
// something different) than the server would independently agree is due right now. Returns the ids
// it actually inserted, which can be fewer than this fetch's own candidates (or none) once the
// day's cap is spent.
async function introduceHiraganaExamples(supabase: AppSupabaseClient, userId: string, timezone: string): Promise<number[]> {
  const { data, error } = await supabase.rpc("introduce_hiragana_examples", {
    p_user_id: userId,
    p_timezone: timezone,
    p_session_id: null,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { hiragana_id: number }[]).map((row) => row.hiragana_id);
}

async function introduceKatakanaExamples(supabase: AppSupabaseClient, userId: string, timezone: string): Promise<number[]> {
  const { data, error } = await supabase.rpc("introduce_katakana_examples", {
    p_user_id: userId,
    p_timezone: timezone,
    p_session_id: null,
  });
  if (error) throw new Error(error.message);
  return ((data ?? []) as { katakana_id: number }[]).map((row) => row.katakana_id);
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

// The whole day's card count, predicted before any of the not-yet-created future cards exist --
// see computeTotalCardsToday for the shared formula (also used by the dashboard's
// cardsRemainingToday, so the two never disagree). Only needs to turn kanjiCandidates' own array
// into the two plain numbers that formula wants.
function computePredictedTotal(
  dueCardCount: number,
  kanjiCandidates: NewKanjiCandidateRow[],
  vocabCandidateCount: number,
  hiraganaCandidateCount: number,
  katakanaCandidateCount: number,
  hiraganaRuleCandidateCount: number,
  katakanaRuleCandidateCount: number
): number {
  return computeTotalCardsToday({
    dueCount: dueCardCount,
    kanjiCandidateCount: kanjiCandidates.length,
    kanjiWordReadingCardsTotal: kanjiCandidates.reduce((sum, c) => sum + c.word_count, 0),
    vocabCandidateCount,
    hiraganaCandidateCount,
    katakanaCandidateCount,
    hiraganaRuleCandidateCount,
    katakanaRuleCandidateCount,
  });
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

  const [
    kanjiCandidatesResult,
    vocabCandidatesResult,
    hiraganaCandidatesResult,
    katakanaCandidatesResult,
    hiraganaRuleCandidatesResult,
    katakanaRuleCandidatesResult,
  ] = await Promise.all([
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
      : Promise.resolve({ data: [] as NewHiraganaCandidateRow[], error: null }),
    katakanaRemaining > 0
      ? supabase.rpc("get_new_katakana_candidates", { p_user_id: userId, p_limit: katakanaRemaining })
      : Promise.resolve({ data: [] as NewKatakanaCandidateRow[], error: null }),
    // Unlike the character candidates above, rule candidates don't consume
    // new_hiragana_per_day/new_katakana_per_day -- so this still runs even once
    // hiraganaRemaining/katakanaRemaining hits 0, passing it through as p_limit anyway (0 is
    // handled correctly -- see get_new_hiragana_rule_candidates) so a rule due today still shows
    // even on a day the character cap is already spent, gated only on the track being enabled.
    settings.study_hiragana
      ? supabase.rpc("get_new_hiragana_rule_candidates", { p_user_id: userId, p_limit: hiraganaRemaining })
      : Promise.resolve({ data: [] as NewHiraganaRuleCandidate[], error: null }),
    settings.study_katakana
      ? supabase.rpc("get_new_katakana_rule_candidates", { p_user_id: userId, p_limit: katakanaRemaining })
      : Promise.resolve({ data: [] as NewKatakanaRuleCandidate[], error: null }),
  ]);

  if (kanjiCandidatesResult.error) throw new Error(kanjiCandidatesResult.error.message);
  if (vocabCandidatesResult.error) throw new Error(vocabCandidatesResult.error.message);
  if (hiraganaCandidatesResult.error) throw new Error(hiraganaCandidatesResult.error.message);
  if (katakanaCandidatesResult.error) throw new Error(katakanaCandidatesResult.error.message);
  if (hiraganaRuleCandidatesResult.error) throw new Error(hiraganaRuleCandidatesResult.error.message);
  if (katakanaRuleCandidatesResult.error) throw new Error(katakanaRuleCandidatesResult.error.message);

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
  const hiraganaRows = (hiraganaCandidatesResult.data ?? []) as NewHiraganaCandidateRow[];
  const katakanaRows = (katakanaCandidatesResult.data ?? []) as NewKatakanaCandidateRow[];
  const hiraganaRuleCandidates = (hiraganaRuleCandidatesResult.data ?? []) as NewHiraganaRuleCandidate[];
  const katakanaRuleCandidates = (katakanaRuleCandidatesResult.data ?? []) as NewKatakanaRuleCandidate[];

  // Split each script's candidates by entry_kind: 'character' rows still become new_hiragana/
  // new_katakana intro cards (unchanged), 'example' rows are batch-introduced silently and their
  // fresh reading cards folded straight into due_cards -- see introduceHiraganaExamples/
  // introduceKatakanaExamples above. This array is only used to decide whether the round trip is
  // worth making at all (the common case -- an example-row pack is only ever "due" right around
  // the moment its kana_type's sokuon/yōon/n_gemination/chōonpu/extended rule becomes reachable) --
  // the RPC itself re-derives which ids are actually eligible and how many fit today's budget, so
  // its own returned ids (not this list) are what get used to fetch reading cards below.
  const hiraganaCandidates = hiraganaRows.filter((c) => c.entry_kind === "character");
  const hasHiraganaExamples = hiraganaRows.some((c) => c.entry_kind === "example");
  const katakanaCandidates = katakanaRows.filter((c) => c.entry_kind === "character");
  const hasKatakanaExamples = katakanaRows.some((c) => c.entry_kind === "example");

  if (hasHiraganaExamples) {
    const introducedIds = await introduceHiraganaExamples(supabase, userId, timezone ?? "UTC");
    if (introducedIds.length > 0) dueCards.push(...(await fetchHiraganaReadingCards(supabase, userId, introducedIds)));
  }
  if (hasKatakanaExamples) {
    const introducedIds = await introduceKatakanaExamples(supabase, userId, timezone ?? "UTC");
    if (introducedIds.length > 0) dueCards.push(...(await fetchKatakanaReadingCards(supabase, userId, introducedIds)));
  }

  return {
    due_cards: dueCards,
    new_kanji_to_introduce: newKanjiToIntroduce,
    new_vocab_to_introduce: vocabCandidates,
    new_hiragana_to_introduce: hiraganaCandidates,
    new_katakana_to_introduce: katakanaCandidates,
    new_hiragana_rules_to_introduce: hiraganaRuleCandidates,
    new_katakana_rules_to_introduce: katakanaRuleCandidates,
    next_due_at: nextDue.data.next_due_at,
    next_due_status: nextDue.data.next_due_status,
    undo_disabled: userFlagsResult.data?.undo_disabled ?? false,
    predicted_total: computePredictedTotal(
      dueCards.length,
      kanjiCandidateRows,
      vocabCandidates.length,
      hiraganaCandidates.length,
      katakanaCandidates.length,
      hiraganaRuleCandidates.length,
      katakanaRuleCandidates.length
    ),
  };
}
