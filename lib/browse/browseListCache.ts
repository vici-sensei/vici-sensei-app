import { readCache, writeCache } from "@/lib/client-data/localCache";
import type { KanjiListResponse, VocabularyListResponse } from "@/lib/types";
import type { JlptLevel } from "@/lib/srs/constants";

// Only the default (no-filter) view gets prefetched/cached -- keying by the level set alone
// is enough since search is always empty and offset always 0 for that view. A different level
// set is simply a different key, so a stale entry never masquerades as the current default.
function createListCache<T>(name: string) {
  const key = (levels: JlptLevel[]) => `cache:${name}-list:${levels.join(",")}`;
  return {
    read: (levels: JlptLevel[]) => readCache<T>(key(levels)),
    write: (levels: JlptLevel[], data: T) => writeCache(key(levels), data),
  };
}

const kanjiListCache = createListCache<KanjiListResponse>("kanji");
const vocabularyListCache = createListCache<VocabularyListResponse>("vocabulary");

export const readKanjiListCache = kanjiListCache.read;
export const writeKanjiListCache = kanjiListCache.write;
export const readVocabularyListCache = vocabularyListCache.read;
export const writeVocabularyListCache = vocabularyListCache.write;
