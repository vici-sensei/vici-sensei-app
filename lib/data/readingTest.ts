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

export interface ReadingTestSession {
  started: boolean;
  queueOrder: number[] | null;
  queuePosition: number;
  draftSentenceId: number | null;
  draftAnswer: string;
}

const EMPTY_SESSION: ReadingTestSession = {
  started: false,
  queueOrder: null,
  queuePosition: 0,
  draftSentenceId: null,
  draftAnswer: "",
};

/** This pass's resume state -- see user_reading_test_attempts' doc comment
 * (20261106_reading_test_resume_state.sql) for what each field means. No row yet (a user who's
 * never reached this test's attempts table at all) reads back as EMPTY_SESSION, same meaning as a
 * fresh row would have. */
export async function fetchReadingTestSession(
  supabase: AppSupabaseClient,
  userId: string,
  testType: string
): Promise<ReadingTestSession> {
  const { data, error } = await supabase
    .from("user_reading_test_attempts")
    .select("started, queue_order, queue_position, draft_sentence_id, draft_answer")
    .eq("user_id", userId)
    .eq("test_type", testType)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return EMPTY_SESSION;
  return {
    started: data.started,
    queueOrder: data.queue_order,
    queuePosition: data.queue_position,
    draftSentenceId: data.draft_sentence_id,
    draftAnswer: data.draft_answer,
  };
}

/** Persists having gotten past the Start screen -- replaces the old per-tab sessionStorage flag so
 * a different device/tab can skip the intro too, even before this test's first answer is in. Once
 * true, stays true forever (a retry never resets it -- see reading_test_retry_wrong). */
export async function markReadingTestStarted(supabase: AppSupabaseClient, userId: string, testType: string): Promise<void> {
  const { error } = await supabase
    .from("user_reading_test_attempts")
    .upsert({ user_id: userId, test_type: testType, started: true }, { onConflict: "user_id,test_type" });
  if (error) throw new Error(error.message);
}

/** Atomically fetches-or-creates this pass's frozen queue (see public.reading_test_ensure_queue) --
 * `queue` is only used the first time, if no queue is set yet; otherwise the existing one wins, so
 * two devices racing to freeze the same pass can't stomp on each other's shuffle order. */
export async function ensureReadingTestQueue(
  supabase: AppSupabaseClient,
  userId: string,
  testType: string,
  queue: number[]
): Promise<number[]> {
  const { data, error } = await supabase.rpc("reading_test_ensure_queue", {
    p_user_id: userId,
    p_test_type: testType,
    p_queue: queue,
  });
  if (error) throw new Error(error.message);
  return data ?? queue;
}

/** How far into this pass's queue the student has advanced -- only bumped by Next (see
 * ReadingTestPage's handleNext), never by Check, so a refresh between the two still shows the
 * just-answered result screen instead of skipping past it. */
export async function advanceReadingTestQueue(
  supabase: AppSupabaseClient,
  userId: string,
  testType: string,
  position: number
): Promise<void> {
  const { error } = await supabase
    .from("user_reading_test_attempts")
    .upsert({ user_id: userId, test_type: testType, queue_position: position }, { onConflict: "user_id,test_type" });
  if (error) throw new Error(error.message);
}

/** Mirrors the current question's not-yet-Checked input server-side (debounced by the caller) so
 * it survives a refresh/device switch, same as an already-Checked answer already does. */
export async function saveReadingTestDraft(
  supabase: AppSupabaseClient,
  userId: string,
  testType: string,
  sentenceId: number,
  answer: string
): Promise<void> {
  const { error } = await supabase.from("user_reading_test_attempts").upsert(
    {
      user_id: userId,
      test_type: testType,
      draft_sentence_id: sentenceId,
      draft_answer: answer,
      draft_updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,test_type" }
  );
  if (error) throw new Error(error.message);
}

/** Fired the moment Check produces a result, same as the old localStorage clearDraft -- the typed
 * text just got persisted as a real answer (see submitReadingTestAnswer), so the draft copy of it
 * is stale. */
export async function clearReadingTestDraft(supabase: AppSupabaseClient, userId: string, testType: string): Promise<void> {
  const { error } = await supabase.from("user_reading_test_attempts").upsert(
    { user_id: userId, test_type: testType, draft_sentence_id: null, draft_answer: "", draft_updated_at: null },
    { onConflict: "user_id,test_type" }
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
