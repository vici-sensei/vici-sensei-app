import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { LevelProgressCategory, StudyStats, TodayActivityCounts } from "@/lib/types";
import { getNextDue } from "@/lib/srs/nextDue";
import { mostAdvancedLevel } from "@/lib/srs/constants";

const DEFAULT_NEW_KANJI_PER_DAY = 1;
const DEFAULT_NEW_VOCAB_PER_DAY = 6;
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
    .select("new_kanji_per_day, new_vocab_per_day, enabled_levels")
    .eq("user_id", userId)
    .maybeSingle();

  if (settingsResult.error) throw new Error(settingsResult.error.message);

  const level = settingsResult.data ? mostAdvancedLevel(settingsResult.data.enabled_levels as string[]) : null;

  const [activityCounts, nextDue, retentionResult, streakResult, weeklyActivityResult, levelProgressResult] = await Promise.all([
    supabase.rpc("get_today_activity_counts", { p_user_id: userId, p_timezone: timezone ?? "UTC" }).single(),
    getNextDue(supabase, userId, timezone),
    // Aggregated in SQL (get_retention_rate, 20260802_retention_rate_rpc.sql) instead of
    // pulling every review_logs row in the window and computing the ratio in JS.
    supabase.rpc("get_retention_rate", { p_user_id: userId, p_window_days: RETENTION_WINDOW_DAYS }),
    supabase.rpc("get_review_streak", { p_user_id: userId }),
    supabase.rpc("get_review_activity", { p_user_id: userId, p_timezone: timezone ?? "UTC", p_days: 7 }),
    level
      ? supabase.rpc("get_level_progress", { p_user_id: userId, p_level: level })
      : Promise.resolve({ data: null, error: null }),
  ]);

  if (activityCounts.error) throw new Error(activityCounts.error.message);
  if (nextDue.error !== null) throw new Error(nextDue.error);
  if (retentionResult.error) throw new Error(retentionResult.error.message);
  if (streakResult.error) throw new Error(streakResult.error.message);
  if (weeklyActivityResult.error) throw new Error(weeklyActivityResult.error.message);
  if (levelProgressResult.error) throw new Error(levelProgressResult.error.message);

  const newKanjiPerDay = settingsResult.data?.new_kanji_per_day ?? DEFAULT_NEW_KANJI_PER_DAY;
  const newVocabPerDay = settingsResult.data?.new_vocab_per_day ?? DEFAULT_NEW_VOCAB_PER_DAY;
  const { due_today: dueToday, due_learning: dueLearning, reviewed_today: reviewedToday, new_kanji_today: newKanjiToday, new_vocab_today: newVocabToday } =
    activityCounts.data as TodayActivityCounts;
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
    reviewed_today: reviewedToday,
    new_kanji_today: newKanjiToday,
    new_kanji_limit: newKanjiPerDay,
    new_vocab_today: newVocabToday,
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
