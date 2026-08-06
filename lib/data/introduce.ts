import type { AppSupabaseClient } from "@/lib/supabase/types";
import { initialLearningState } from "@/lib/srs/scheduler";
import { ApiError } from "@/lib/api/client";

export async function introduceKanji(
  supabase: AppSupabaseClient,
  userId: string,
  kanjiId: number,
  sessionId?: number
): Promise<void> {
  const { data: existing, error: existingError } = await supabase
    .from("user_kanji_meaning_progress")
    .select("id")
    .eq("user_id", userId)
    .eq("kanji_id", kanjiId)
    .maybeSingle();

  if (existingError) throw new ApiError(500, existingError.message);
  if (existing) throw new ApiError(409, "This kanji has already been introduced.");

  const { error: meaningError } = await supabase
    .from("user_kanji_meaning_progress")
    .insert({ user_id: userId, kanji_id: kanjiId, session_id: sessionId ?? null, ...initialLearningState() });

  if (meaningError) throw new ApiError(500, meaningError.message);

  const { data: kanjiWords, error: kanjiWordsError } = await supabase.rpc("get_kanji_detail_words", {
    p_kanji_id: kanjiId,
  });

  if (kanjiWordsError) throw new ApiError(500, kanjiWordsError.message);

  if (kanjiWords && kanjiWords.length > 0) {
    const { error: readingInsertError } = await supabase.from("user_kanji_reading_progress").insert(
      kanjiWords.map((kw: { kanji_word_id: number }) => ({
        user_id: userId,
        kanji_id: kanjiId,
        kanji_word_id: kw.kanji_word_id,
        ...initialLearningState(),
      }))
    );

    if (readingInsertError) throw new ApiError(500, readingInsertError.message);
  }
}

export async function introduceVocabulary(
  supabase: AppSupabaseClient,
  userId: string,
  wordId: number,
  sessionId?: number
): Promise<void> {
  const { data: existing, error: existingError } = await supabase
    .from("user_vocabulary_progress")
    .select("id")
    .eq("user_id", userId)
    .eq("word_id", wordId)
    .maybeSingle();

  if (existingError) throw new ApiError(500, existingError.message);
  if (existing) throw new ApiError(409, "This word has already been introduced.");

  const { error } = await supabase
    .from("user_vocabulary_progress")
    .insert({ user_id: userId, word_id: wordId, session_id: sessionId ?? null, ...initialLearningState() });

  if (error) throw new ApiError(500, error.message);
}
