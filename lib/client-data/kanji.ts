"use client";

import { fetchKanjiDetail, fetchKanjiInfoByCharacters, fetchKanjiList, type KanjiListParams } from "@/lib/data/kanji";
import { readKanjiListCache, writeKanjiListCache } from "@/lib/browse/browseListCache";
import { readKanjiDetailCache, writeKanjiDetailCache } from "@/lib/browse/browseDetailCache";
import { createListDetailHooks } from "@/lib/client-data/createListDetailHooks";
import type { KanjiDetail, KanjiInfo, KanjiListResponse } from "@/lib/types";

const { useList: useKanjiList, prefetchList: prefetchKanjiList, useDetail: useKanjiDetail, prefetchDetail: prefetchKanjiDetail } =
  createListDetailHooks<KanjiListResponse, KanjiListParams, KanjiDetail>({
    fetchList: fetchKanjiList,
    fetchDetail: fetchKanjiDetail,
    readListCache: readKanjiListCache,
    writeListCache: writeKanjiListCache,
    readDetailCache: readKanjiDetailCache,
    writeDetailCache: writeKanjiDetailCache,
    listErrorFallback: "Failed to load kanji.",
    detailErrorFallback: "Failed to load kanji.",
  });

export { useKanjiList, prefetchKanjiList, useKanjiDetail, prefetchKanjiDetail };

// One promise per character for the whole page lifetime -- the kanji table is static reference
// data, and the same kanji keep turning up across a session's "New kanji" word lists.
const kanjiInfoCache = new Map<string, Promise<KanjiInfo | null>>();

/** Looks up every not-yet-cached char in `chars` in a single query -- NewKanjiIntroCard calls this
 * with its whole word list as soon as the words arrive, so a later long-press on any of them
 * (getKanjiInfo) resolves instantly instead of waiting on its own round trip. */
export function prefetchKanjiInfo(chars: string[]): void {
  const missing = [...new Set(chars)].filter((char) => !kanjiInfoCache.has(char));
  if (missing.length === 0) return;
  const batch = fetchKanjiInfoByCharacters(missing);
  for (const char of missing) {
    const promise = batch.then((rows) => rows.find((row) => row.kanji === char) ?? null);
    // A failed lookup isn't kept, so the next long-press on the same kanji retries it.
    promise.catch(() => {
      if (kanjiInfoCache.get(char) === promise) kanjiInfoCache.delete(char);
    });
    kanjiInfoCache.set(char, promise);
  }
}

/** The kanji table's meaning + level for `char`, or null if it has no row for it. */
export function getKanjiInfo(char: string): Promise<KanjiInfo | null> {
  prefetchKanjiInfo([char]);
  return kanjiInfoCache.get(char) as Promise<KanjiInfo | null>;
}
