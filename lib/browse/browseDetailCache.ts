import { readCache, writeCache } from "@/lib/client-data/localCache";
import type { KanjiDetail, VocabularyDetailRow } from "@/lib/types";

function kanjiDetailCacheKey(id: number): string {
  return `cache:kanji-detail:${id}`;
}

function vocabularyDetailCacheKey(id: number): string {
  return `cache:vocabulary-detail:${id}`;
}

export function readKanjiDetailCache(id: number): KanjiDetail | null {
  return readCache<KanjiDetail>(kanjiDetailCacheKey(id));
}

export function writeKanjiDetailCache(id: number, data: KanjiDetail): void {
  writeCache(kanjiDetailCacheKey(id), data);
}

export function readVocabularyDetailCache(id: number): VocabularyDetailRow | null {
  return readCache<VocabularyDetailRow>(vocabularyDetailCacheKey(id));
}

export function writeVocabularyDetailCache(id: number, data: VocabularyDetailRow): void {
  writeCache(vocabularyDetailCacheKey(id), data);
}
