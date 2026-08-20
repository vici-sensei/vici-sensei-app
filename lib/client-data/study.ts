import { createClient } from "@/lib/supabase/client";
import { ApiError } from "@/lib/api/client";
import { fetchFirstDueCard, fetchStudyQueue } from "@/lib/data/studyQueue";
import { fetchStudySettings } from "@/lib/data/studySettings";
import { submitReview as submitReviewData, undoReview as undoReviewData } from "@/lib/data/reviews";
import { startStudySession, endStudySession, getSessionProgress as getSessionProgressData } from "@/lib/data/studySessions";
import { introduceKanji as introduceKanjiData, introduceVocabulary as introduceVocabularyData } from "@/lib/data/introduce";
import { writeFirstCardCache } from "@/lib/study/firstCardCache";
import { createPrefetcher } from "@/lib/client-data/createPrefetcher";
import type {
  DueCard,
  ReviewRequestBody,
  StudySettings,
  StudyQueueResponse,
  StudySessionEnd,
  StudySessionStart,
  SubmitReviewResult,
} from "@/lib/types";

async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new ApiError(401, "You are not logged in. Please log in.");
  return user.id;
}

// userId/settings are the study page's own already-validated copies (from
// useStudyOnboarding, seeded by the layout gate) -- passing them in skips both the
// getUser() revalidation round trip and the user_study_settings query that the other
// functions below still do for themselves, since this is the hot path for the first
// card the user sees.
export async function getFirstDueCard(userId: string, settings: StudySettings): Promise<DueCard | null> {
  const supabase = createClient();
  return fetchFirstDueCard(supabase, userId, settings);
}

export async function getStudyQueue(userId: string, settings: StudySettings): Promise<StudyQueueResponse> {
  const supabase = createClient();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return fetchStudyQueue(supabase, userId, timezone, settings);
}

/** Fire-and-forget: called on hover/focus of a "Start studying" entry point, well before
 * the user actually navigates to /study. Self-sufficient (fetches its own settings, unlike
 * getFirstDueCard above) since callers here are outside the study route's context and this
 * isn't latency-sensitive -- nothing is waiting on it. Writes straight to the localStorage
 * cache useStudyQueue reads on mount. */
export const prefetchFirstDueCard = createPrefetcher(async (userId: string) => {
  const supabase = createClient();
  const settings = await fetchStudySettings(supabase, userId);
  if (!settings) return;
  const card = await fetchFirstDueCard(supabase, userId, settings);
  if (card) writeFirstCardCache(userId, card);
});

export async function submitReview(input: ReviewRequestBody): Promise<SubmitReviewResult> {
  const supabase = createClient();
  const userId = await requireUserId();
  return submitReviewData(supabase, userId, input);
}

export async function undoReview(reviewLogId?: number): Promise<void> {
  const supabase = createClient();
  const userId = await requireUserId();
  await undoReviewData(supabase, userId, reviewLogId);
}

export async function startSession(userId: string): Promise<StudySessionStart> {
  const supabase = createClient();
  return startStudySession(supabase, userId);
}

export async function endSession(sessionId: number): Promise<StudySessionEnd> {
  const supabase = createClient();
  const userId = await requireUserId();
  return endStudySession(supabase, userId, sessionId);
}

export async function getSessionProgress(sessionId: number): Promise<number> {
  const supabase = createClient();
  const userId = await requireUserId();
  return getSessionProgressData(supabase, userId, sessionId);
}

export async function introduceKanji(kanjiId: number, sessionId?: number): Promise<void> {
  const supabase = createClient();
  const userId = await requireUserId();
  await introduceKanjiData(supabase, userId, kanjiId, sessionId);
}

export async function introduceVocabulary(wordId: number, sessionId?: number): Promise<void> {
  const supabase = createClient();
  const userId = await requireUserId();
  await introduceVocabularyData(supabase, userId, wordId, sessionId);
}
