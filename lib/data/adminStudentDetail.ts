import type { AppSupabaseClient } from "@/lib/supabase/types";
import type {
  StudentAchievement,
  StudentDailyActivity,
  StudentDetail,
  StudentReviewLogEntry,
  StudentTestResult,
} from "@/lib/types";

export async function fetchStudentDetail(supabase: AppSupabaseClient, studentId: string): Promise<StudentDetail | null> {
  const [userResult, statsResult, settingsResult, retentionResult] = await Promise.all([
    supabase
      .from("users")
      .select("id, display_name, email, avatar_url, country, is_premium, created_at, pending_deletion_at")
      .eq("id", studentId)
      .maybeSingle(),
    supabase.from("leaderboard_stats").select("current_streak, longest_streak, last_active_date").eq("user_id", studentId).maybeSingle(),
    supabase
      .from("user_study_settings")
      .select("study_track, enabled_levels, new_kanji_per_day, new_vocab_per_day, new_hiragana_per_day, new_katakana_per_day, max_reviews_per_day")
      .eq("user_id", studentId)
      .maybeSingle(),
    supabase.rpc("get_retention_rate", { p_user_id: studentId, p_window_days: 30 }),
  ]);

  if (userResult.error) throw new Error(userResult.error.message);
  if (!userResult.data) return null;
  if (statsResult.error) throw new Error(statsResult.error.message);
  if (settingsResult.error) throw new Error(settingsResult.error.message);
  if (retentionResult.error) throw new Error(retentionResult.error.message);

  const user = userResult.data;
  const stats = statsResult.data;
  const settings = settingsResult.data;

  return {
    id: user.id,
    display_name: user.display_name,
    email: user.email,
    avatar_url: user.avatar_url,
    country: user.country,
    is_premium: user.is_premium,
    created_at: user.created_at,
    pending_deletion_at: user.pending_deletion_at,
    current_streak: stats?.current_streak ?? 0,
    longest_streak: stats?.longest_streak ?? 0,
    last_active_date: stats?.last_active_date ?? null,
    retention_rate: retentionResult.data,
    study_track: settings?.study_track ?? null,
    enabled_levels: settings?.enabled_levels ?? [],
    new_kanji_per_day: settings?.new_kanji_per_day ?? null,
    new_vocab_per_day: settings?.new_vocab_per_day ?? null,
    new_hiragana_per_day: settings?.new_hiragana_per_day ?? null,
    new_katakana_per_day: settings?.new_katakana_per_day ?? null,
    max_reviews_per_day: settings?.max_reviews_per_day ?? null,
  };
}

export async function fetchStudentDailyActivity(supabase: AppSupabaseClient, studentId: string): Promise<StudentDailyActivity[]> {
  const { data, error } = await supabase
    .from("leaderboard_daily_stats")
    .select("day, reviews_count, new_cards_count, xp_points")
    .eq("user_id", studentId)
    .order("day", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

/** On-demand drill-down for one calendar day -- exactly which items were reviewed, not just the
 *  count from fetchStudentDailyActivity. dayStart/dayEnd are ISO timestamps, half-open [start, end). */
export async function fetchStudentReviewLogsForDay(
  supabase: AppSupabaseClient,
  studentId: string,
  dayStart: string,
  dayEnd: string
): Promise<StudentReviewLogEntry[]> {
  const { data, error } = await supabase
    .from("review_logs")
    .select(
      "id, exercise_type, correct, reviewed_at, kanji:kanji_id(kanji), word:word_id(word, kana_reading), hiragana:hiragana_id(character), katakana:katakana_id(character)"
    )
    .eq("user_id", studentId)
    .eq("undone", false)
    .gte("reviewed_at", dayStart)
    .lt("reviewed_at", dayEnd)
    .order("reviewed_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data as unknown as StudentReviewLogEntry[];
}

export async function fetchStudentTestResults(supabase: AppSupabaseClient, studentId: string): Promise<StudentTestResult[]> {
  const { data, error } = await supabase
    .from("test_status")
    .select("id, test_type, attempt_number, percent, earned_at")
    .eq("user_id", studentId)
    .order("earned_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}

export async function fetchStudentAchievements(supabase: AppSupabaseClient, studentId: string): Promise<StudentAchievement[]> {
  const { data, error } = await supabase
    .from("user_achievements")
    .select("achievement_key, earned_at")
    .eq("user_id", studentId)
    .order("earned_at", { ascending: false });

  if (error) throw new Error(error.message);
  return data;
}
