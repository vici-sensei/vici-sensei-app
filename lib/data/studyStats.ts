import { cache } from "react";
import type { SupabaseServerClient } from "@/lib/supabase/server";
import type { StudyStats } from "@/lib/types";
import { utcDayBounds } from "@/lib/srs/day";
import { getNextDue } from "@/lib/srs/nextDue";

const DEFAULT_NEW_KANJI_PER_DAY = 2;
const DEFAULT_NEW_VOCAB_PER_DAY = 12;
const RETENTION_WINDOW_DAYS = 30;

const DUE_PROGRESS_TABLES = ["user_kanji_meaning_progress", "user_kanji_reading_progress", "user_vocabulary_progress"] as const;

export async function fetchStudyStats(
  supabase: SupabaseServerClient,
  userId: string,
  timezone?: string
): Promise<StudyStats> {
  const nowIso = new Date().toISOString();
  const { start: todayStart, end: todayEnd } = utcDayBounds(new Date(), timezone);
  const windowStart = new Date(Date.now() - RETENTION_WINDOW_DAYS * 86_400_000).toISOString();

  // All of these are independent of one another (each only needs userId/nowIso), so they
  // run as one batch instead of the sequential awaits the /api/study/stats route used to do.
  const [settingsResult, dueCounters, nextDue, newKanjiResult, newVocabResult, retentionResult, streakResult] =
    await Promise.all([
      supabase
        .from("user_study_settings")
        .select("new_kanji_per_day, new_vocab_per_day")
        .eq("user_id", userId)
        .maybeSingle(),
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
    ]);

  if (settingsResult.error) throw new Error(settingsResult.error.message);
  for (const result of dueCounters) {
    if (result.error) throw new Error(result.error.message);
  }
  if (nextDue.error !== null) throw new Error(nextDue.error);
  if (newKanjiResult.error) throw new Error(newKanjiResult.error.message);
  if (newVocabResult.error) throw new Error(newVocabResult.error.message);
  if (retentionResult.error) throw new Error(retentionResult.error.message);
  if (streakResult.error) throw new Error(streakResult.error.message);

  const newKanjiPerDay = settingsResult.data?.new_kanji_per_day ?? DEFAULT_NEW_KANJI_PER_DAY;
  const newVocabPerDay = settingsResult.data?.new_vocab_per_day ?? DEFAULT_NEW_VOCAB_PER_DAY;
  const dueToday = dueCounters.reduce((sum, r) => sum + (r.count ?? 0), 0);
  const { next_due_at: nextDueAt, next_due_is_today: nextDueIsToday } = nextDue.data;

  return {
    due_today: dueToday,
    new_kanji_today: newKanjiResult.count ?? 0,
    new_kanji_limit: newKanjiPerDay,
    new_vocab_today: newVocabResult.count ?? 0,
    new_vocab_limit: newVocabPerDay,
    streak: streakResult.data,
    retention_rate: retentionResult.data,
    next_due_at: nextDueAt,
    next_due_is_today: nextDueIsToday,
  };
}

/** Cached per-request so every layout/page that needs stats shares one set of queries. */
export const getStudyStats = cache(fetchStudyStats);
