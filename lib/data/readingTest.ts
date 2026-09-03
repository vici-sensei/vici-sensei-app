import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { ReadingTestSentence } from "@/lib/types";

export async function fetchReadingTestSentences(
  supabase: AppSupabaseClient,
  testType: string
): Promise<ReadingTestSentence[]> {
  const { data, error } = await supabase
    .from("test")
    .select("id, test_type, sort_order, question, romaji, english, particle_furiganas")
    .eq("test_type", testType)
    .order("sort_order");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export interface ReadingTestAnswer {
  correct: boolean;
  userAnswer: string;
}

/** Every sentence this user has already attempted for this test, right or wrong -- a sentence
 * with no entry here is still pending (never attempted, or reopened by a "retry the wrong ones"
 * -- see resetWrongAnswers below). Both outcomes are persisted (not just correct ones) so a
 * sentence answered wrong stays locked across a refresh/reopen too -- only the explicit retry
 * flow reopens it, rather than any reload giving it a free extra attempt. */
export async function fetchReadingTestProgress(
  supabase: AppSupabaseClient,
  userId: string,
  testType: string
): Promise<Map<number, ReadingTestAnswer>> {
  const { data, error } = await supabase
    .from("user_reading_test_progress")
    .select("sentence_id, correct, user_answer")
    .eq("user_id", userId)
    .eq("test_type", testType);
  if (error) throw new Error(error.message);
  return new Map(
    (data ?? []).map((row) => [row.sentence_id as number, { correct: row.correct, userAnswer: row.user_answer }])
  );
}

/** Persists one Check result, right or wrong. Upserts so answering the same sentence twice
 * (shouldn't happen through the UI, which locks a sentence the instant it has any result, but is
 * harmless either way) just refreshes the row instead of erroring on the unique constraint. */
export async function submitReadingTestAnswer(
  supabase: AppSupabaseClient,
  userId: string,
  testType: string,
  sentenceId: number,
  correct: boolean,
  userAnswer: string
): Promise<void> {
  const { error } = await supabase.from("user_reading_test_progress").upsert(
    {
      user_id: userId,
      test_type: testType,
      sentence_id: sentenceId,
      correct,
      user_answer: userAnswer,
      attempted_at: new Date().toISOString(),
    },
    { onConflict: "user_id,sentence_id" }
  );
  if (error) throw new Error(error.message);
}

/** "Retry the ones I got wrong" (the summary page): reopens every wrong row for this test as
 * pending again (correct ones are untouched and stay locked) and bumps the attempt counter --
 * see public.reading_test_retry_wrong, which does both atomically so a refresh mid-retry can't
 * reopen sentences without recording the new attempt. */
export async function resetWrongAnswers(supabase: AppSupabaseClient, userId: string, testType: string): Promise<void> {
  const { error } = await supabase.rpc("reading_test_retry_wrong", {
    p_user_id: userId,
    p_test_type: testType,
  });
  if (error) throw new Error(error.message);
}

/** Which attempt of this test the user is currently on -- 1 until their first retry, then
 * however many times they've reopened their wrong answers (see reading_test_retry_wrong). Same
 * number public.reading_test_progress_updates_badge stamps onto their badge for this test. */
export async function fetchReadingTestAttempt(
  supabase: AppSupabaseClient,
  userId: string,
  testType: string
): Promise<number> {
  const { data, error } = await supabase.rpc("reading_test_current_attempt", {
    p_user_id: userId,
    p_test_type: testType,
  });
  if (error) throw new Error(error.message);
  return data ?? 1;
}

/** Whether the user has 100%'d this test -- see public.reading_test_passed
 * (20260915_user_reading_test_progress.sql), the same function the katakana-gating triggers use,
 * so this can never disagree with what actually unlocks katakana. */
export async function fetchReadingTestPassed(
  supabase: AppSupabaseClient,
  userId: string,
  testType: string
): Promise<boolean> {
  const { data, error } = await supabase.rpc("reading_test_passed", {
    p_user_id: userId,
    p_test_type: testType,
  });
  if (error) throw new Error(error.message);
  return Boolean(data);
}
