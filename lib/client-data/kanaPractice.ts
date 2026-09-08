import { createClient } from "@/lib/supabase/client";
import { fetchSeenHiragana, fetchSeenKatakana } from "@/lib/data/kanaPractice";
import type { PracticeKanaCard } from "@/lib/data/kanaPractice";

export type { PracticeKanaCard };

/** Every hiragana/katakana character this user has ever seen, combined -- app/(study)/study/
 * practice shuffles this itself, so the order returned here doesn't matter. */
export async function getPracticeDeck(userId: string): Promise<PracticeKanaCard[]> {
  const supabase = createClient();
  const [hiragana, katakana] = await Promise.all([fetchSeenHiragana(supabase, userId), fetchSeenKatakana(supabase, userId)]);
  return [...hiragana, ...katakana];
}
