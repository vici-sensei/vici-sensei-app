import { readCache, writeCache } from "@/lib/client-data/localCache";
import type { KanjiDetail, VocabularyDetailRow } from "@/lib/types";

function createDetailCache<T>(name: string) {
  const key = (id: number) => `cache:${name}-detail:${id}`;
  return {
    read: (id: number) => readCache<T>(key(id)),
    write: (id: number, data: T) => writeCache(key(id), data),
  };
}

const kanjiDetailCache = createDetailCache<KanjiDetail>("kanji");
const vocabularyDetailCache = createDetailCache<VocabularyDetailRow>("vocabulary");

export const readKanjiDetailCache = kanjiDetailCache.read;
export const writeKanjiDetailCache = kanjiDetailCache.write;
export const readVocabularyDetailCache = vocabularyDetailCache.read;
export const writeVocabularyDetailCache = vocabularyDetailCache.write;
