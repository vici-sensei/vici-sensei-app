import { readCache, writeCache } from "@/lib/client-data/localCache";
import type { KanjiListResponse, VocabularyListResponse } from "@/lib/types";
import type { JlptLevel } from "@/lib/srs/constants";

// Only the default (no-filter) view gets prefetched/cached -- keying by the level set alone
// is enough since search is always empty and offset always 0 for that view. A different level
// set is simply a different key, so a stale entry never masquerades as the current default.
function kanjiListCacheKey(levels: JlptLevel[]): string {
  return `cache:kanji-list:${levels.join(",")}`;
}

function vocabularyListCacheKey(levels: JlptLevel[]): string {
  return `cache:vocabulary-list:${levels.join(",")}`;
}

export function readKanjiListCache(levels: JlptLevel[]): KanjiListResponse | null {
  return readCache<KanjiListResponse>(kanjiListCacheKey(levels));
}

export function writeKanjiListCache(levels: JlptLevel[], data: KanjiListResponse): void {
  writeCache(kanjiListCacheKey(levels), data);
}

export function readVocabularyListCache(levels: JlptLevel[]): VocabularyListResponse | null {
  return readCache<VocabularyListResponse>(vocabularyListCacheKey(levels));
}

export function writeVocabularyListCache(levels: JlptLevel[], data: VocabularyListResponse): void {
  writeCache(vocabularyListCacheKey(levels), data);
}
