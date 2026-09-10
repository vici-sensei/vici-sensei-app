import { createClient } from "@/lib/supabase/client";
import {
  fetchBonusHiragana,
  fetchBonusKatakana,
  fetchHiraganaMastered,
  fetchKatakanaMastered,
  fetchSeenHiragana,
  fetchSeenKatakana,
} from "@/lib/data/kanaPractice";
import type { PracticeKanaCard } from "@/lib/data/kanaPractice";

export type { PracticeKanaCard };

/** Every hiragana/katakana character this user has ever seen, combined -- app/(study)/study/
 * practice shuffles this itself, so the order returned here doesn't matter. Once BOTH scripts
 * are fully mastered (fetchHiraganaMastered/fetchKatakanaMastered -- every study_enabled
 * character in each learned to review/relearning), study_enabled = false bonus characters from
 * both are mixed in too (fetchBonusHiragana/fetchBonusKatakana) -- mastering only one script
 * unlocks no bonus content yet, since katakana itself doesn't unlock until hiragana is mastered
 * (enforce_katakana_requires_hiragana_mastered), so this only ever adds a wait on top of that. */
export async function getPracticeDeck(userId: string): Promise<PracticeKanaCard[]> {
  const supabase = createClient();
  const [hiragana, katakana, hiraganaMastered, katakanaMastered] = await Promise.all([
    fetchSeenHiragana(supabase, userId),
    fetchSeenKatakana(supabase, userId),
    fetchHiraganaMastered(supabase, userId),
    fetchKatakanaMastered(supabase, userId),
  ]);
  const bothMastered = hiraganaMastered && katakanaMastered;
  const [bonusHiragana, bonusKatakana] = await Promise.all([
    bothMastered ? fetchBonusHiragana(supabase) : Promise.resolve([]),
    bothMastered ? fetchBonusKatakana(supabase) : Promise.resolve([]),
  ]);
  return [...hiragana, ...katakana, ...bonusHiragana, ...bonusKatakana];
}
