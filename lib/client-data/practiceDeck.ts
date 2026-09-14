import { createClient } from "@/lib/supabase/client";
import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { JlptLevel } from "@/lib/srs/constants";
import {
  fetchBonusHiragana,
  fetchBonusKatakana,
  fetchHiraganaMastered,
  fetchKatakanaMastered,
  fetchSeenHiragana,
  fetchSeenKatakana,
} from "@/lib/data/kanaPractice";
import { fetchSeenKanjiMeaning, fetchSeenKanjiReading } from "@/lib/data/kanjiPractice";
import { fetchSeenVocabMeaning } from "@/lib/data/vocabPractice";
import type { PracticeCategory } from "@/lib/study/practiceCategories";
import type { PracticeKanaPoolCard, PracticePoolCard } from "@/lib/study/practicePool";

export type { PracticePoolCard };

/** hiragana/katakana together, since bonus content only unlocks once BOTH scripts are fully
 * mastered regardless of which one(s) are actually selected -- see fetchHiraganaMastered's own
 * doc comment. Only fetches (and only ever returns) the script(s) actually in `categories`. */
async function getKanaPool(
  supabase: AppSupabaseClient,
  userId: string,
  categories: readonly PracticeCategory[]
): Promise<PracticeKanaPoolCard[]> {
  const wantHiragana = categories.includes("hiragana");
  const wantKatakana = categories.includes("katakana");

  const [hiragana, katakana, hiraganaMastered, katakanaMastered] = await Promise.all([
    wantHiragana ? fetchSeenHiragana(supabase, userId) : Promise.resolve([]),
    wantKatakana ? fetchSeenKatakana(supabase, userId) : Promise.resolve([]),
    fetchHiraganaMastered(supabase, userId),
    fetchKatakanaMastered(supabase, userId),
  ]);
  const bothMastered = hiraganaMastered && katakanaMastered;
  const [bonusHiragana, bonusKatakana] = await Promise.all([
    bothMastered && wantHiragana ? fetchBonusHiragana(supabase) : Promise.resolve([]),
    bothMastered && wantKatakana ? fetchBonusKatakana(supabase) : Promise.resolve([]),
  ]);

  return [...hiragana, ...katakana, ...bonusHiragana, ...bonusKatakana].map((item) => ({
    kind: item.script,
    id: item.id,
    character: item.character,
    romaji: item.romaji,
    bonus: item.bonus,
  }));
}

/** Builds the free-practice deck for exactly the categories the user picked on /study/practice's
 * setup screen, scoped to their currently enabled JLPT level(s) for kanji/vocabulary -- unlike
 * kana (every seen character, any level, kana has none), a kanji/vocab item that's technically
 * been seen but falls outside the user's current level(s) (e.g. after a level reset) is left out,
 * matching what get_due_cards would surface for review. Order is unspecified -- the caller
 * shuffles. */
export async function getPracticeDeck(
  userId: string,
  categories: readonly PracticeCategory[],
  enabledLevels: readonly JlptLevel[]
): Promise<PracticePoolCard[]> {
  const supabase = createClient();
  const pools: Promise<PracticePoolCard[]>[] = [];

  if (categories.includes("hiragana") || categories.includes("katakana")) {
    pools.push(getKanaPool(supabase, userId, categories));
  }
  if (categories.includes("kanji")) {
    pools.push(
      Promise.all([fetchSeenKanjiMeaning(supabase, userId, enabledLevels), fetchSeenKanjiReading(supabase, userId, enabledLevels)]).then(
        ([meaning, reading]) => [...meaning, ...reading]
      )
    );
  }
  if (categories.includes("vocabulary")) {
    pools.push(fetchSeenVocabMeaning(supabase, userId, enabledLevels));
  }

  const results = await Promise.all(pools);
  return results.flat();
}
