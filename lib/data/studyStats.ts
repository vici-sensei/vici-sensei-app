import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { KanaRuleProgress, LevelProgressCategory, StudyStats, TodayActivityCounts } from "@/lib/types";
import { getNextDue } from "@/lib/srs/nextDue";
import { mostAdvancedLevel } from "@/lib/srs/constants";

const DEFAULT_NEW_KANJI_PER_DAY = 1;
const DEFAULT_NEW_VOCAB_PER_DAY = 6;
const DEFAULT_NEW_HIRAGANA_PER_DAY = 15;
const DEFAULT_NEW_KATAKANA_PER_DAY = 15;
const RETENTION_WINDOW_DAYS = 30;

export async function fetchStudyStats(
  supabase: AppSupabaseClient,
  userId: string,
  timezone?: string
): Promise<StudyStats> {
  // Fetched alone first because the level-progress RPC below needs the student's current
  // level, derived from enabled_levels -- everything else is independent of it and still
  // runs as one batch instead of the sequential awaits the /api/study/stats route used to do.
  const settingsResult = await supabase
    .from("user_study_settings")
    .select(
      "new_kanji_per_day, new_vocab_per_day, new_hiragana_per_day, new_katakana_per_day, enabled_levels, study_track, study_kanji, study_vocabulary, study_hiragana, study_katakana"
    )
    .eq("user_id", userId)
    .maybeSingle();

  if (settingsResult.error) throw new Error(settingsResult.error.message);

  const level = settingsResult.data ? mostAdvancedLevel(settingsResult.data.enabled_levels as string[]) : null;

  const isKana = settingsResult.data?.study_track === "kana";

  const [
    activityCounts,
    nextDue,
    retentionResult,
    streakResult,
    streakRecordResult,
    weeklyActivityResult,
    levelProgressResult,
    readingTestPassedResult,
  ] = await Promise.all([
    supabase.rpc("get_today_activity_counts", { p_user_id: userId, p_timezone: timezone ?? "UTC" }).single(),
    getNextDue(supabase, userId, timezone),
    // Aggregated in SQL (get_retention_rate, 20260802_retention_rate_rpc.sql) instead of
    // pulling every review_logs row in the window and computing the ratio in JS.
    supabase.rpc("get_retention_rate", { p_user_id: userId, p_window_days: RETENTION_WINDOW_DAYS }),
    supabase.rpc("get_review_streak", { p_user_id: userId, p_timezone: timezone ?? "UTC" }),
    // Longest streak ever, tracked incrementally on leaderboard_stats.longest_streak
    // (20260909_streak_record.sql) rather than rescanned from review_logs on every poll.
    supabase.rpc("get_review_streak_record", { p_user_id: userId, p_timezone: timezone ?? "UTC" }),
    supabase.rpc("get_review_activity", { p_user_id: userId, p_timezone: timezone ?? "UTC", p_days: 7 }),
    level
      ? supabase.rpc("get_level_progress", { p_user_id: userId, p_level: level })
      : Promise.resolve({ data: null, error: null }),
    // Only meaningful on the kana track -- see reading_test_passed (20260915_user_reading_test_progress.sql).
    isKana
      ? supabase.rpc("reading_test_passed", { p_user_id: userId, p_test_type: "hiragana" })
      : Promise.resolve({ data: false, error: null }),
  ]);

  if (activityCounts.error) throw new Error(activityCounts.error.message);
  if (nextDue.error !== null) throw new Error(nextDue.error);
  if (retentionResult.error) throw new Error(retentionResult.error.message);
  if (streakResult.error) throw new Error(streakResult.error.message);
  if (streakRecordResult.error) throw new Error(streakRecordResult.error.message);
  if (weeklyActivityResult.error) throw new Error(weeklyActivityResult.error.message);
  if (levelProgressResult.error) throw new Error(levelProgressResult.error.message);
  if (readingTestPassedResult.error) throw new Error(readingTestPassedResult.error.message);

  const newKanjiPerDay = settingsResult.data?.new_kanji_per_day ?? DEFAULT_NEW_KANJI_PER_DAY;
  const newVocabPerDay = settingsResult.data?.new_vocab_per_day ?? DEFAULT_NEW_VOCAB_PER_DAY;
  const newHiraganaPerDay = settingsResult.data?.new_hiragana_per_day ?? DEFAULT_NEW_HIRAGANA_PER_DAY;
  const newKatakanaPerDay = settingsResult.data?.new_katakana_per_day ?? DEFAULT_NEW_KATAKANA_PER_DAY;
  const studyTrack = settingsResult.data?.study_track ?? "standard";
  const {
    due_today: dueToday,
    due_learning: dueLearning,
    reviewed_today: reviewedToday,
    new_kanji_today: newKanjiToday,
    new_vocab_today: newVocabToday,
    new_hiragana_today: newHiraganaToday,
    new_katakana_today: newKatakanaToday,
  } = activityCounts.data as TodayActivityCounts;
  const dueReview = dueToday - dueLearning;
  const { next_due_at: nextDueAt, next_due_is_today: nextDueIsToday, next_due_status: nextDueStatus } = nextDue.data;

  // Same reasoning as computePredictedTotal in lib/data/studyQueue.ts: a pending new-kanji
  // candidate doesn't cost just 1 card, it costs 1 (New kanji) + 1 (Kanji meaning) + word_count
  // (Word reading, one per example word) once introduced. cardsRemainingToday on the dashboard
  // used to count it as 1, badly undercounting "cards to do today" -- this fetches the same
  // word_count data /study's queue already uses so both numbers agree.
  //
  // All four categories also fetch their real get_new_*_candidates rows here (not just kanji),
  // even though vocab/hiragana/katakana are a flat 2 cards per candidate and don't need per-item
  // data the way kanji's word_count does -- new_X_per_day has no upper bound tying it to how much
  // content actually exists (kana only enforces >=15/step-of-5, kanji/vocab enforce nothing), so
  // the *_limit - *_today quota-remaining figure alone can massively overstate what's actually
  // learnable today. Using the real row count instead means new_X_available (and everything
  // derived from it: cardsRemainingToday, the dashboard's "N ready to learn" text) can never
  // overcount, no matter how the quota is set.
  const kanjiRemaining = settingsResult.data?.study_kanji ? Math.max(newKanjiPerDay - newKanjiToday, 0) : 0;
  const vocabRemaining = settingsResult.data?.study_vocabulary ? Math.max(newVocabPerDay - newVocabToday, 0) : 0;
  const hiraganaRemaining = settingsResult.data?.study_hiragana
    ? Math.max(newHiraganaPerDay - newHiraganaToday, 0)
    : 0;
  const katakanaRemaining = settingsResult.data?.study_katakana
    ? Math.max(newKatakanaPerDay - newKatakanaToday, 0)
    : 0;
  const enabledLevels = (settingsResult.data?.enabled_levels ?? []) as string[];

  const [kanjiCandidatesResult, vocabCandidatesResult, hiraganaCandidatesResult, katakanaCandidatesResult] =
    await Promise.all([
      kanjiRemaining > 0
        ? supabase.rpc("get_new_kanji_candidates", { p_user_id: userId, p_enabled_levels: enabledLevels, p_limit: kanjiRemaining })
        : Promise.resolve({ data: [] as { word_count: number }[], error: null }),
      vocabRemaining > 0
        ? supabase.rpc("get_new_vocab_candidates", { p_user_id: userId, p_enabled_levels: enabledLevels, p_limit: vocabRemaining })
        : Promise.resolve({ data: [] as unknown[], error: null }),
      hiraganaRemaining > 0
        ? supabase.rpc("get_new_hiragana_candidates", { p_user_id: userId, p_limit: hiraganaRemaining })
        : Promise.resolve({ data: [] as unknown[], error: null }),
      katakanaRemaining > 0
        ? supabase.rpc("get_new_katakana_candidates", { p_user_id: userId, p_limit: katakanaRemaining })
        : Promise.resolve({ data: [] as unknown[], error: null }),
    ]);
  if (kanjiCandidatesResult.error) throw new Error(kanjiCandidatesResult.error.message);
  if (vocabCandidatesResult.error) throw new Error(vocabCandidatesResult.error.message);
  if (hiraganaCandidatesResult.error) throw new Error(hiraganaCandidatesResult.error.message);
  if (katakanaCandidatesResult.error) throw new Error(katakanaCandidatesResult.error.message);
  const newKanjiPendingReviewCards = ((kanjiCandidatesResult.data ?? []) as { word_count: number }[]).reduce(
    (sum, c) => sum + c.word_count,
    0
  );
  const newKanjiAvailable = (kanjiCandidatesResult.data ?? []).length;
  const newVocabAvailable = (vocabCandidatesResult.data ?? []).length;
  const newHiraganaAvailable = (hiraganaCandidatesResult.data ?? []).length;
  const newKatakanaAvailable = (katakanaCandidatesResult.data ?? []).length;
  const levelProgressRows = levelProgressResult.data as
    | { category: string; seen: number; learned: number; total: number }[]
    | null;
  const categoryFor = (category: string): LevelProgressCategory => {
    const row = levelProgressRows?.find((r) => r.category === category);
    return { seen: row?.seen ?? 0, learned: row?.learned ?? 0, total: row?.total ?? 0 };
  };
  // Order here is what the dashboard's hiragana/katakana progress cards render, outermost ring
  // first -- see get_level_progress's 'hiragana_' || kana_type / 'katakana_' || kana_type rows
  // (20260907_kana_rule_level_progress.sql).
  const HIRAGANA_KANA_TYPES = ["seion", "dakuten", "handakuten", "yoon", "sokuon", "n_gemination"];
  const KATAKANA_KANA_TYPES = [...HIRAGANA_KANA_TYPES, "choonpu", "extended"];
  const kanaRulesFor = (script: "hiragana" | "katakana", kanaTypes: string[]): KanaRuleProgress[] =>
    kanaTypes.map((kanaType) => ({ kana_type: kanaType, ...categoryFor(`${script}_${kanaType}`) }));
  // Reuses the hiragana_reading row the level-progress call above already returned (it ignores
  // p_level for this category) instead of a second RPC just to check mastery.
  const hiraganaReadingProgress = categoryFor("hiragana_reading");
  const hiraganaMastered = hiraganaReadingProgress.total > 0 && hiraganaReadingProgress.learned >= hiraganaReadingProgress.total;

  return {
    study_track: studyTrack,
    study_kanji: settingsResult.data?.study_kanji ?? false,
    study_vocabulary: settingsResult.data?.study_vocabulary ?? false,
    study_hiragana: settingsResult.data?.study_hiragana ?? false,
    study_katakana: settingsResult.data?.study_katakana ?? false,
    due_today: dueToday,
    due_learning: dueLearning,
    due_review: dueReview,
    reviewed_today: reviewedToday,
    new_kanji_today: newKanjiToday,
    new_kanji_limit: newKanjiPerDay,
    new_kanji_pending_review_cards: newKanjiPendingReviewCards,
    new_kanji_available: newKanjiAvailable,
    new_vocab_available: newVocabAvailable,
    new_hiragana_available: newHiraganaAvailable,
    new_katakana_available: newKatakanaAvailable,
    new_vocab_today: newVocabToday,
    new_vocab_limit: newVocabPerDay,
    new_hiragana_today: newHiraganaToday,
    new_hiragana_limit: newHiraganaPerDay,
    new_katakana_today: newKatakanaToday,
    new_katakana_limit: newKatakanaPerDay,
    streak: streakResult.data,
    streak_record: streakRecordResult.data,
    weekly_activity: (weeklyActivityResult.data ?? []).map((row: { day: string; has_activity: boolean }) => ({
      date: row.day,
      active: row.has_activity,
    })),
    retention_rate: retentionResult.data,
    next_due_at: nextDueAt,
    next_due_is_today: nextDueIsToday,
    next_due_status: nextDueStatus,
    hiragana_mastered: hiraganaMastered,
    reading_test_passed: Boolean(readingTestPassedResult.data),
    level_progress: level
      ? {
          level,
          kanji: categoryFor("kanji"),
          kanji_reading: categoryFor("kanji_reading"),
          vocabulary: categoryFor("vocabulary"),
          hiragana_reading: categoryFor("hiragana_reading"),
          katakana_reading: categoryFor("katakana_reading"),
          hiragana_rules: kanaRulesFor("hiragana", HIRAGANA_KANA_TYPES),
          katakana_rules: kanaRulesFor("katakana", KATAKANA_KANA_TYPES),
        }
      : null,
  };
}
