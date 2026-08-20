import type { AppSupabaseClient } from "@/lib/supabase/types";
import { getNextDue } from "@/lib/srs/nextDue";
import { ApiError } from "@/lib/api/client";
import type { StudySessionEnd, StudySessionStart } from "@/lib/types";

export async function startStudySession(supabase: AppSupabaseClient, userId: string): Promise<StudySessionStart> {
  const { data, error } = await supabase
    .from("study_sessions")
    .insert({ user_id: userId })
    .select("id, started_at")
    .single();

  if (error) throw new ApiError(500, error.message);
  return { session_id: data.id, started_at: data.started_at };
}

// Mirrors the counting logic in end_study_session (reviews + newly introduced kanji/vocab
// tagged with this session_id), but read-only -- used to restore the study page's progress
// bar after a refresh, when the session is still open and its stored id was already known.
export async function getSessionProgress(
  supabase: AppSupabaseClient,
  userId: string,
  sessionId: number
): Promise<number> {
  const [reviewed, newKanji, newVocab] = await Promise.all([
    supabase
      .from("review_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("session_id", sessionId)
      .eq("undone", false),
    supabase
      .from("user_kanji_meaning_progress")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("session_id", sessionId),
    supabase
      .from("user_vocabulary_progress")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("session_id", sessionId),
  ]);

  if (reviewed.error) throw new ApiError(500, reviewed.error.message);
  if (newKanji.error) throw new ApiError(500, newKanji.error.message);
  if (newVocab.error) throw new ApiError(500, newVocab.error.message);

  return (reviewed.count ?? 0) + (newKanji.count ?? 0) + (newVocab.count ?? 0);
}

type EndStudySessionRow = {
  id: number;
  started_at: string;
  ended_at: string;
  cards_reviewed: number;
  cards_correct: number;
  new_cards_learned: number;
  duration_seconds: number;
};

export async function endStudySession(
  supabase: AppSupabaseClient,
  userId: string,
  sessionId: number
): Promise<StudySessionEnd> {
  const { data, error } = await supabase.rpc("end_study_session", {
    p_user_id: userId,
    p_session_id: sessionId,
  });

  if (error) throw new ApiError(500, error.message);
  const row = ((data ?? []) as EndStudySessionRow[])[0];
  if (!row) throw new ApiError(404, "Study session not found.");

  const nextDue = await getNextDue(supabase, userId, row.ended_at);
  if (nextDue.error !== null) throw new ApiError(500, nextDue.error);

  return {
    ...row,
    user_id: userId,
    accuracy: row.cards_reviewed > 0 ? row.cards_correct / row.cards_reviewed : null,
    ...nextDue.data,
  };
}
