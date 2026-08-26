import { createClient } from "@/lib/supabase/client";
import { ApiError } from "@/lib/api/client";
import {
  fetchCompleteVocabBatch,
  fetchFirstDueCard,
  fetchHiraganaReadingCards,
  fetchKanjiIntroCards,
  fetchKatakanaReadingCards,
  fetchStudyQueue,
} from "@/lib/data/studyQueue";
import { fetchStudySettings } from "@/lib/data/studySettings";
import { submitReview as submitReviewData, undoReview as undoReviewData } from "@/lib/data/reviews";
import { startStudySession, endStudySession, getSessionProgress as getSessionProgressData } from "@/lib/data/studySessions";
import { introduceCard as introduceCardData, type IntroduceKind } from "@/lib/data/introduce";
import { recordHiraganaDrillResult, recordKatakanaDrillResult, type KanaDrillResult } from "@/lib/data/kanaDrill";
import { writeFirstCardCache } from "@/lib/study/firstCardCache";
import { createPrefetcher } from "@/lib/client-data/createPrefetcher";
import type {
  DueCard,
  NewKanjiIntroWord,
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

export async function getStudyQueue(
  userId: string,
  settings: StudySettings,
  onKanjiWordsReady?: (wordsByKanjiId: Map<number, NewKanjiIntroWord[]>) => void
): Promise<StudyQueueResponse> {
  const supabase = createClient();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  return fetchStudyQueue(supabase, userId, timezone, settings, onKanjiWordsReady);
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

async function introduce(kind: IntroduceKind, itemId: number, sessionId?: number): Promise<void> {
  const supabase = createClient();
  const userId = await requireUserId();
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  await introduceCardData(supabase, kind, userId, itemId, timezone, sessionId);
}

export function introduceKanji(kanjiId: number, sessionId?: number): Promise<void> {
  return introduce("kanji", kanjiId, sessionId);
}

/** Called right after a "New kanji" card finishes introducing, to fetch that kanji's
 * kanji_meaning + kanji_reading cards for immediate display (see introduce_kanji, which sets
 * due_at = now() on introduce specifically so these are ready right away). */
export async function getKanjiIntroCards(kanjiId: number): Promise<DueCard[]> {
  const supabase = createClient();
  const userId = await requireUserId();
  return fetchKanjiIntroCards(supabase, userId, kanjiId);
}

export function introduceVocabulary(wordId: number, sessionId?: number): Promise<void> {
  return introduce("vocabulary", wordId, sessionId);
}

/** Called right after the last "New vocabulary" card in the queue finishes introducing, to
 * atomically release and fetch today's whole vocab_meaning batch for immediate display -- see
 * complete_vocab_batch, which flips pending_batch = false (the only thing that ever hides a
 * fresh word from get_due_cards, with no delay involved) for every word still pending. */
export async function completeVocabBatch(): Promise<DueCard[]> {
  const supabase = createClient();
  const userId = await requireUserId();
  return fetchCompleteVocabBatch(supabase, userId);
}

export function introduceHiragana(hiraganaId: number, sessionId?: number): Promise<void> {
  return introduce("hiragana", hiraganaId, sessionId);
}

export function introduceKatakana(katakanaId: number, sessionId?: number): Promise<void> {
  return introduce("katakana", katakanaId, sessionId);
}

/** Called right after a whole "New Hiragana" gojuon pack finishes introducing, to fetch
 * that same pack's "Hiragana reading" cards for immediate display (see introduce_hiragana,
 * which sets due_at = now() on introduce specifically so these are ready right away). */
export async function getHiraganaReadingCards(hiraganaIds: number[]): Promise<DueCard[]> {
  const supabase = createClient();
  const userId = await requireUserId();
  return fetchHiraganaReadingCards(supabase, userId, hiraganaIds);
}

export async function getKatakanaReadingCards(katakanaIds: number[]): Promise<DueCard[]> {
  const supabase = createClient();
  const userId = await requireUserId();
  return fetchKatakanaReadingCards(supabase, userId, katakanaIds);
}

export async function submitHiraganaDrillResult(hiraganaId: number, correct: boolean): Promise<KanaDrillResult> {
  const supabase = createClient();
  const userId = await requireUserId();
  return recordHiraganaDrillResult(supabase, userId, hiraganaId, correct);
}

export async function submitKatakanaDrillResult(katakanaId: number, correct: boolean): Promise<KanaDrillResult> {
  const supabase = createClient();
  const userId = await requireUserId();
  return recordKatakanaDrillResult(supabase, userId, katakanaId, correct);
}
