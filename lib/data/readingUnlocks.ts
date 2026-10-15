import type { AppSupabaseClient } from "@/lib/supabase/types";
import { ApiError } from "@/lib/api/client";
import type { NewKanjiIntroWord, ReadingUnlockCandidate } from "@/lib/types";

// "Reading unlock" cards -- see supabase/migrations/20261015183526_kanji_reading_unlocks.sql and
// docs/READING_UNLOCK_PLAN.md. A kanji's words far above its own level get no "Word reading" card
// when the kanji is introduced; they wait (user_kanji_reading_pending) until the student's level is
// one below theirs, then come back here, one card per kanji.

// Raised by unlock_kanji_readings when there's nothing to do for this card (kanji study off, the
// daily limit already used up, nothing left to unlock) -- the same "drop the card" signal as the
// introduce_* functions' P0002 (see lib/data/introduce.ts).
const NOTHING_TO_UNLOCK_ERRCODE = "P0002";

type ReadingUnlockRow = {
  kanji_id: number;
  kanji: string;
  kanji_meanings: string[] | null;
  kanji_level: string | null;
  kun_readings: string[] | null;
  on_readings: string[] | null;
  kanji_word_id: number;
  word: string;
  furiganas: string[] | null;
  primary_meanings: string[] | null;
  jlpt_level: string | null;
  usually_kana: boolean | null;
};

/** Today's "Reading unlock" cards, in the order get_reading_unlock_candidates returns them (lowest
 * kanji level first), already cut to what new_reading_unlocks_per_day leaves for today. */
export async function fetchReadingUnlockCandidates(
  supabase: AppSupabaseClient,
  userId: string,
  timezone: string | undefined
): Promise<ReadingUnlockCandidate[]> {
  const { data, error } = await supabase.rpc("get_reading_unlock_candidates", {
    p_user_id: userId,
    p_timezone: timezone ?? "UTC",
  });
  if (error) throw new Error(error.message);

  const byKanji = new Map<number, ReadingUnlockCandidate>();
  for (const row of (data ?? []) as ReadingUnlockRow[]) {
    let candidate = byKanji.get(row.kanji_id);
    if (!candidate) {
      candidate = {
        kanji_id: row.kanji_id,
        kanji: row.kanji,
        meanings: row.kanji_meanings,
        level: row.kanji_level,
        kun_readings: row.kun_readings,
        on_readings: row.on_readings,
        words: [],
      };
      byKanji.set(row.kanji_id, candidate);
    }
    const word: NewKanjiIntroWord = {
      id: row.kanji_word_id,
      vocabulary: {
        word: row.word,
        primary_meanings: row.primary_meanings,
        jlpt_level: row.jlpt_level,
        usually_kana: row.usually_kana,
        furiganas: row.furiganas,
      },
    };
    candidate.words.push(word);
  }
  return [...byKanji.values()];
}

/** Cards these "Reading unlock" candidates will put in today's queue: the unlock card itself plus
 * one "Word reading" card per word. */
export function readingUnlockCardCount(candidates: ReadingUnlockCandidate[]): number {
  return candidates.reduce((sum, c) => sum + 1 + c.words.length, 0);
}

/** The "Reading unlock" card's Next: creates the Word reading cards of every word of this kanji the
 * student's level now allows, and returns the kanji_word ids unlocked today (including any another
 * tab already unlocked). 409 = nothing to do here, drop the card. */
export async function unlockKanjiReadings(
  supabase: AppSupabaseClient,
  userId: string,
  kanjiId: number,
  timezone: string
): Promise<number[]> {
  const { data, error } = await supabase.rpc("unlock_kanji_readings", {
    p_user_id: userId,
    p_kanji_id: kanjiId,
    p_timezone: timezone,
  });
  if (error) throw new ApiError(error.code === NOTHING_TO_UNLOCK_ERRCODE ? 409 : 500, error.message);
  return ((data ?? []) as { kanji_word_id: number }[]).map((row) => row.kanji_word_id);
}
