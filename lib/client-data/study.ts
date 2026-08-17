import { createClient } from "@/lib/supabase/client";
import { ApiError } from "@/lib/api/client";
import { fetchStudyQueue } from "@/lib/data/studyQueue";
import { submitReview as submitReviewData, undoReview as undoReviewData } from "@/lib/data/reviews";
import { startStudySession, endStudySession } from "@/lib/data/studySessions";
import { introduceKanji as introduceKanjiData, introduceVocabulary as introduceVocabularyData } from "@/lib/data/introduce";
import type { ReviewRequestBody, StudyQueueResponse, StudySessionEnd, StudySessionStart, SubmitReviewResult } from "@/lib/types";

async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new ApiError(401, "You are not logged in. Please log in.");
  return user.id;
}

export async function getStudyQueue(): Promise<StudyQueueResponse> {
  const supabase = createClient();
  const userId = await requireUserId();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return fetchStudyQueue(supabase, userId, timezone);
}

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

export async function startSession(): Promise<StudySessionStart> {
  const supabase = createClient();
  const userId = await requireUserId();
  return startStudySession(supabase, userId);
}

export async function endSession(sessionId: number): Promise<StudySessionEnd> {
  const supabase = createClient();
  const userId = await requireUserId();
  return endStudySession(supabase, userId, sessionId);
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
