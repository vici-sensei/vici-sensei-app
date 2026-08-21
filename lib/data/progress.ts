import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { KanjiProgressResponse, KanjiReadingProgress, ProgressStatusCounts, ProgressSummaryResponse, VocabularyProgress } from "@/lib/types";
import { PROGRESS_STATUSES } from "@/lib/srs/constants";

function countByStatus(rows: { status: string }[]): ProgressStatusCounts {
  const counts = Object.fromEntries(PROGRESS_STATUSES.map((s) => [s, 0])) as unknown as ProgressStatusCounts;
  for (const row of rows) {
    counts[row.status as keyof ProgressStatusCounts] += 1;
  }
  return counts;
}

export async function fetchKanjiProgress(
  supabase: AppSupabaseClient,
  userId: string,
  kanjiId: number
): Promise<KanjiProgressResponse> {
  const [meaningResult, readingsResult] = await Promise.all([
    supabase.from("user_kanji_meaning_progress").select("status, due_at").eq("user_id", userId).eq("kanji_id", kanjiId).maybeSingle(),
    supabase
      .from("user_kanji_reading_progress")
      .select("id, status, due_at, kanji_word_id, kanji_word:kanji_word_id(reading_group, vocabulary:id_word(word, kana_reading))")
      .eq("user_id", userId)
      .eq("kanji_id", kanjiId),
  ]);

  if (meaningResult.error) throw new Error(meaningResult.error.message);
  if (readingsResult.error) throw new Error(readingsResult.error.message);

  return { meaning: meaningResult.data, readings: readingsResult.data as unknown as KanjiReadingProgress[] };
}

export async function fetchVocabularyProgress(
  supabase: AppSupabaseClient,
  userId: string,
  wordId: number
): Promise<VocabularyProgress | null> {
  const { data, error } = await supabase
    .from("user_vocabulary_progress")
    .select("status, due_at")
    .eq("user_id", userId)
    .eq("word_id", wordId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function fetchProgressSummary(
  supabase: AppSupabaseClient,
  userId: string
): Promise<ProgressSummaryResponse> {
  const [meaning, reading, vocab, hiragana, katakana] = await Promise.all([
    supabase.from("user_kanji_meaning_progress").select("status").eq("user_id", userId),
    supabase.from("user_kanji_reading_progress").select("status").eq("user_id", userId),
    supabase.from("user_vocabulary_progress").select("status").eq("user_id", userId),
    supabase.from("user_hiragana_progress").select("status").eq("user_id", userId),
    supabase.from("user_katakana_progress").select("status").eq("user_id", userId),
  ]);

  if (meaning.error) throw new Error(meaning.error.message);
  if (reading.error) throw new Error(reading.error.message);
  if (vocab.error) throw new Error(vocab.error.message);
  if (hiragana.error) throw new Error(hiragana.error.message);
  if (katakana.error) throw new Error(katakana.error.message);

  return {
    kanji_meaning: countByStatus(meaning.data),
    kanji_reading: countByStatus(reading.data),
    vocab_meaning: countByStatus(vocab.data),
    hiragana_reading: countByStatus(hiragana.data),
    katakana_reading: countByStatus(katakana.data),
  };
}
