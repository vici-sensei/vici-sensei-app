import { useEffect, useState } from "react";
import type { DueCard } from "@/lib/types";
import { fetchStudyWordOtherMeanings } from "@/lib/data/vocabulary";

// Shared by every card of the page load: a word comes back as a relearning card, and the same word
// sits behind several Word reading cards (one per kanji) -- each would otherwise fetch it again.
const resolved = new Map<string, string[][] | null>();
const inFlight = new Map<string, Promise<string[][] | null>>();

function cacheKey(card: DueCard): string | null {
  if (card.word_id != null) return `word:${card.word_id}`;
  if (card.kanji_word_id != null) return `kanji_word:${card.kanji_word_id}`;
  return null;
}

function load(card: DueCard, key: string): Promise<string[][] | null> {
  let promise = inFlight.get(key);
  if (!promise) {
    promise = fetchStudyWordOtherMeanings(card.word_id != null ? { wordId: card.word_id } : { kanjiWordId: card.kanji_word_id! })
      .then((meanings) => {
        resolved.set(key, meanings);
        return meanings;
      })
      .finally(() => inFlight.delete(key));
    inFlight.set(key, promise);
  }
  return promise;
}

/**
 * The tested word's other_meanings, for the "Show other meanings" toggle a vocab_meaning or
 * kanji_reading card shows once revealed. Fetched as soon as the card mounts, so it's normally
 * there by the time the student has typed an answer. Best-effort, like fetchSiblingReadingPairs in
 * useKanjiReadingReviewCard: until it arrives, or if it fails, the card just has no toggle.
 */
export function useWordOtherMeanings(card: DueCard): string[][] | null {
  const key = cacheKey(card);
  const [meanings, setMeanings] = useState<string[][] | null>(() => (key ? (resolved.get(key) ?? null) : null));

  useEffect(() => {
    if (!key || resolved.has(key)) return;
    let cancelled = false;
    load(card, key)
      .then((result) => {
        if (!cancelled) setMeanings(result);
      })
      .catch(() => {
        // Left out of `resolved`, so the next card of this word tries again.
      });
    return () => {
      cancelled = true;
    };
    // The key is the only thing the fetch depends on -- the card's other fields (progress, rating
    // previews, ...) change between reviews of the same word.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return meanings;
}
