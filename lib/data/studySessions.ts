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
