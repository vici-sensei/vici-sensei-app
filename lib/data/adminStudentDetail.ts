import type { AppSupabaseClient } from "@/lib/supabase/types";
import { showsKanaOnly } from "@/lib/study/furigana";
import type {
  StudentAchievement,
  StudentActivityEntry,
  StudentDailyActivity,
  StudentDetail,
  StudentNewCardProgress,
  StudentPracticeLogEntry,
  StudentReviewLogEntry,
  StudentTestResult,
} from "@/lib/types";

/** Shared label for a review_logs/practice_logs row -- both are joined to the same
 * kanji/word/hiragana/katakana shape, differing only in which table (and timestamp column) they
 * came from. */
function activityItemLabel(entry: {
  exercise_type: string;
  kanji: { kanji: string } | null;
  word: { word: string; kana_reading: string | null; usually_kana: boolean | null } | null;
  hiragana: { character: string } | null;
  katakana: { character: string } | null;
}): string {
  if (entry.kanji) return entry.kanji.kanji;
  if (entry.word) {
    if (showsKanaOnly(entry.word)) return entry.word.kana_reading ?? entry.word.word;
    return entry.word.kana_reading ? `${entry.word.word} (${entry.word.kana_reading})` : entry.word.word;
  }
  if (entry.hiragana) return entry.hiragana.character;
  if (entry.katakana) return entry.katakana.character;
  return entry.exercise_type;
}

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
      .select(
        "study_track, enabled_levels, new_kanji_per_day, new_vocab_per_day, new_hiragana_per_day, new_katakana_per_day, max_reviews_per_day, extended_romaji_enabled, kana_practice_enabled, timezone, timezone_preference_enabled"
      )
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
    extended_romaji_enabled: settings?.extended_romaji_enabled ?? null,
    kana_practice_enabled: settings?.kana_practice_enabled ?? null,
    timezone: settings?.timezone ?? null,
    timezone_preference_enabled: settings?.timezone_preference_enabled ?? null,
  };
}

/** get_student_daily_activity (20261235_kana_graduated_at_and_student_daily_activity.sql;
 *  test_count moved onto leaderboard_daily_stats itself -- a running counter bumped on every
 *  reading-test answer, retries included, same as reviews_count/new_cards_count -- by
 *  20261237_test_count_on_leaderboard_stats.sql) folds every activity type -- reviews, new cards,
 *  kana drill graduations, free practice, reading test answers -- into one per-day row, bucketed
 *  by the student's own study day (same 6am-local rollover leaderboard_daily_stats.day already
 *  uses), not a naive UTC calendar date. */
export async function fetchStudentDailyActivity(supabase: AppSupabaseClient, studentId: string): Promise<StudentDailyActivity[]> {
  const { data, error } = await supabase.rpc("get_student_daily_activity", { p_user_id: studentId });

  if (error) throw new Error(error.message);
  return data;
}

/** get_student_new_card_progress (20261245_student_new_card_progress_rpc.sql): the per-day new-card
 *  history (by category and JLPT level), the size of every pool, and the reading tests -- all
 *  already bucketed by the student's own study day -- for the "New cards progress" chart. */
export async function fetchStudentNewCardProgress(supabase: AppSupabaseClient, studentId: string): Promise<StudentNewCardProgress> {
  const { data, error } = await supabase.rpc("get_student_new_card_progress", { p_user_id: studentId });

  if (error) throw new Error(error.message);
  return data as StudentNewCardProgress;
}

/** On-demand drill-down for one calendar day -- every individual item behind that day's
 *  reviews/practice/learned/test counts from fetchStudentDailyActivity, merged into one
 *  chronological list. `day` is the same study-day date label that row already carries (e.g.
 *  "2026-09-19"); study_day_range (20261239_study_day_range_rpc.sql) turns it into the same
 *  6am-local-to-the-student [day_start, day_end) window get_student_daily_activity itself used to
 *  bucket that row, so items shown here always match the row they're nested under -- not a naive
 *  UTC midnight-to-midnight boundary, which could mis-attribute anything answered between
 *  midnight and 6am local. */
export async function fetchStudentActivityForDay(
  supabase: AppSupabaseClient,
  studentId: string,
  day: string,
  timezone: string
): Promise<StudentActivityEntry[]> {
  const { data: range, error: rangeError } = await supabase
    .rpc("study_day_range", { p_day: day, p_timezone: timezone })
    .single();
  if (rangeError) throw new Error(rangeError.message);
  const { day_start: dayStart, day_end: dayEnd } = range as { day_start: string; day_end: string };

  const [reviewsResult, practiceResult, hiraganaResult, katakanaResult, testResult] = await Promise.all([
    supabase
      .from("review_logs")
      .select(
        "id, exercise_type, correct, reviewed_at, kanji:kanji_id(kanji), word:word_id(word, kana_reading, usually_kana), hiragana:hiragana_id(character), katakana:katakana_id(character)"
      )
      .eq("user_id", studentId)
      .eq("undone", false)
      .gte("reviewed_at", dayStart)
      .lt("reviewed_at", dayEnd),
    supabase
      .from("practice_logs")
      .select(
        "id, exercise_type, correct, practiced_at, kanji:kanji_id(kanji), word:word_id(word, kana_reading, usually_kana), hiragana:hiragana_id(character), katakana:katakana_id(character)"
      )
      .eq("user_id", studentId)
      .gte("practiced_at", dayStart)
      .lt("practiced_at", dayEnd),
    supabase
      .from("user_hiragana_progress")
      .select("hiragana_id, graduated_at, hiragana:hiragana_id(character)")
      .eq("user_id", studentId)
      .not("graduated_at", "is", null)
      .gte("graduated_at", dayStart)
      .lt("graduated_at", dayEnd),
    supabase
      .from("user_katakana_progress")
      .select("katakana_id, graduated_at, katakana:katakana_id(character)")
      .eq("user_id", studentId)
      .not("graduated_at", "is", null)
      .gte("graduated_at", dayStart)
      .lt("graduated_at", dayEnd),
    supabase
      .from("test_status")
      .select("id, test_type, attempt_number, percent, earned_at")
      .eq("user_id", studentId)
      .gte("earned_at", dayStart)
      .lt("earned_at", dayEnd),
  ]);

  if (reviewsResult.error) throw new Error(reviewsResult.error.message);
  if (practiceResult.error) throw new Error(practiceResult.error.message);
  if (hiraganaResult.error) throw new Error(hiraganaResult.error.message);
  if (katakanaResult.error) throw new Error(katakanaResult.error.message);
  if (testResult.error) throw new Error(testResult.error.message);

  const reviews = reviewsResult.data as unknown as StudentReviewLogEntry[];
  const practice = practiceResult.data as unknown as StudentPracticeLogEntry[];
  const hiraganaGraduations = hiraganaResult.data as unknown as {
    hiragana_id: number;
    graduated_at: string;
    hiragana: { character: string } | null;
  }[];
  const katakanaGraduations = katakanaResult.data as unknown as {
    katakana_id: number;
    graduated_at: string;
    katakana: { character: string } | null;
  }[];
  const tests = testResult.data as unknown as StudentTestResult[];

  const entries: StudentActivityEntry[] = [
    ...reviews.map(
      (r): StudentActivityEntry => ({
        kind: "review",
        key: `review-${r.id}`,
        at: r.reviewed_at,
        label: activityItemLabel(r),
        correct: r.correct,
      })
    ),
    ...practice.map(
      (p): StudentActivityEntry => ({
        kind: "practice",
        key: `practice-${p.id}`,
        at: p.practiced_at,
        label: activityItemLabel(p),
        correct: p.correct,
      })
    ),
    ...hiraganaGraduations.map(
      (g): StudentActivityEntry => ({
        kind: "learned",
        key: `learned-hiragana-${g.hiragana_id}`,
        at: g.graduated_at,
        label: g.hiragana?.character ?? "hiragana",
      })
    ),
    ...katakanaGraduations.map(
      (g): StudentActivityEntry => ({
        kind: "learned",
        key: `learned-katakana-${g.katakana_id}`,
        at: g.graduated_at,
        label: g.katakana?.character ?? "katakana",
      })
    ),
    ...tests.map(
      (t): StudentActivityEntry => ({
        kind: "test",
        key: `test-${t.id}`,
        at: t.earned_at,
        label: `${t.test_type} attempt #${t.attempt_number}`,
        percent: t.percent,
      })
    ),
  ];

  return entries.sort((a, b) => a.at.localeCompare(b.at));
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
