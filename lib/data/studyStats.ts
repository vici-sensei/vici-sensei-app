import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { LevelProgressCategory, StudyStats } from "@/lib/types";
import { utcDayBounds } from "@/lib/srs/day";
import { getNextDue } from "@/lib/srs/nextDue";
import { mostAdvancedLevel } from "@/lib/srs/constants";

const DEFAULT_NEW_KANJI_PER_DAY = 2;
const DEFAULT_NEW_VOCAB_PER_DAY = 12;
const RETENTION_WINDOW_DAYS = 30;

const DUE_PROGRESS_TABLES = ["user_kanji_meaning_progress", "user_kanji_reading_progress", "user_vocabulary_progress"] as const;

export async function fetchStudyStats(
  supabase: AppSupabaseClient,
  userId: string,
  timezone?: string
): Promise<StudyStats> {
  const nowIso = new Date().toISOString();
  const { start: todayStart, end: todayEnd } = utcDayBounds(new Date(), timezone);
  const windowStart = new Date(Date.now() - RETENTION_WINDOW_DAYS * 86_400_000).toISOString();

  // Fetched alone first because the level-progress RPC below needs the student's current
  // level, derived from enabled_levels -- everything else is independent of it and still
  // runs as one batch instead of the sequential awaits the /api/study/stats route used to do.
  const settingsResult = await supabase
    .from("user_study_settings")
    .select("new_kanji_per_day, new_vocab_per_day, enabled_levels")
    .eq("user_id", userId)
    .maybeSingle();

  if (settingsResult.error) throw new Error(settingsResult.error.message);

  const level = settingsResult.data ? mostAdvancedLevel(settingsResult.data.enabled_levels as string[]) : null;

  const [
    dueCounters,
    dueLearningCounters,
    reviewedTodayResult,
    nextDue,
    newKanjiResult,
    newVocabResult,
    retentionResult,
    streakResult,
    weeklyActivityResult,
    levelProgressResult,
  ] = await Promise.all([
      Promise.all(
        DUE_PROGRESS_TABLES.map((table) =>
          supabase
            .from(table)
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .lte("due_at", nowIso)
            .neq("status", "suspended")
        )
      ),
      // Subset of dueCounters still mid-ladder (learning/relearning) -- these resurface later
      // today; the rest of dueCounters (status 'review') won't come back until a future day.
      Promise.all(
        DUE_PROGRESS_TABLES.map((table) =>
          supabase
            .from(table)
            .select("id", { count: "exact", head: true })
            .eq("user_id", userId)
            .lte("due_at", nowIso)
            .in("status", ["learning", "relearning"])
        )
      ),
      supabase
        .from("review_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("undone", false)
        .gte("reviewed_at", todayStart)
        .lt("reviewed_at", todayEnd),
      getNextDue(supabase, userId, nowIso, timezone),
      supabase
        .from("user_kanji_meaning_progress")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("repetitions", 0)
        .gte("created_at", todayStart)
        .lt("created_at", todayEnd),
      supabase
        .from("user_vocabulary_progress")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("repetitions", 0)
        .gte("created_at", todayStart)
        .lt("created_at", todayEnd),
      // Aggregated in SQL (get_retention_rate, 20260802_retention_rate_rpc.sql) instead of
      // pulling every review_logs row in the window and computing the ratio in JS.
      supabase.rpc("get_retention_rate", { p_user_id: userId, p_window_start: windowStart }),
      supabase.rpc("get_review_streak", { p_user_id: userId }),
      supabase.rpc("get_review_activity", { p_user_id: userId, p_timezone: timezone ?? "UTC", p_days: 7 }),
      level
        ? supabase.rpc("get_level_progress", { p_user_id: userId, p_level: level })
        : Promise.resolve({ data: null, error: null }),
    ]);

  for (const result of dueCounters) {
    if (result.error) throw new Error(result.error.message);
  }
  for (const result of dueLearningCounters) {
    if (result.error) throw new Error(result.error.message);
  }
  if (reviewedTodayResult.error) throw new Error(reviewedTodayResult.error.message);
  if (nextDue.error !== null) throw new Error(nextDue.error);
  if (newKanjiResult.error) throw new Error(newKanjiResult.error.message);
  if (newVocabResult.error) throw new Error(newVocabResult.error.message);
  if (retentionResult.error) throw new Error(retentionResult.error.message);
  if (streakResult.error) throw new Error(streakResult.error.message);
  if (weeklyActivityResult.error) throw new Error(weeklyActivityResult.error.message);
  if (levelProgressResult.error) throw new Error(levelProgressResult.error.message);

  const newKanjiPerDay = settingsResult.data?.new_kanji_per_day ?? DEFAULT_NEW_KANJI_PER_DAY;
  const newVocabPerDay = settingsResult.data?.new_vocab_per_day ?? DEFAULT_NEW_VOCAB_PER_DAY;
  const dueToday = dueCounters.reduce((sum, r) => sum + (r.count ?? 0), 0);
  const dueLearning = dueLearningCounters.reduce((sum, r) => sum + (r.count ?? 0), 0);
  const dueReview = dueToday - dueLearning;
  const { next_due_at: nextDueAt, next_due_is_today: nextDueIsToday } = nextDue.data;
  const levelProgressRows = levelProgressResult.data as
    | { category: "kanji" | "kanji_reading" | "vocabulary"; seen: number; learned: number; total: number }[]
    | null;
  const categoryFor = (category: "kanji" | "kanji_reading" | "vocabulary"): LevelProgressCategory => {
    const row = levelProgressRows?.find((r) => r.category === category);
    return { seen: row?.seen ?? 0, learned: row?.learned ?? 0, total: row?.total ?? 0 };
  };

  return {
    due_today: dueToday,
    due_learning: dueLearning,
    due_review: dueReview,
    reviewed_today: reviewedTodayResult.count ?? 0,
    new_kanji_today: newKanjiResult.count ?? 0,
    new_kanji_limit: newKanjiPerDay,
    new_vocab_today: newVocabResult.count ?? 0,
    new_vocab_limit: newVocabPerDay,
    streak: streakResult.data,
    weekly_activity: (weeklyActivityResult.data ?? []).map((row: { day: string; has_activity: boolean }) => ({
      date: row.day,
      active: row.has_activity,
    })),
    retention_rate: retentionResult.data,
    next_due_at: nextDueAt,
    next_due_is_today: nextDueIsToday,
    level_progress: level
      ? {
          level,
          kanji: categoryFor("kanji"),
          kanji_reading: categoryFor("kanji_reading"),
          vocabulary: categoryFor("vocabulary"),
        }
      : null,
  };
}
