"use client";

import { fetchKanjiDetail, fetchKanjiList, type KanjiListParams } from "@/lib/data/kanji";
import { readKanjiListCache, writeKanjiListCache } from "@/lib/browse/browseListCache";
import { readKanjiDetailCache, writeKanjiDetailCache } from "@/lib/browse/browseDetailCache";
import { createListDetailHooks } from "@/lib/client-data/createListDetailHooks";
import type { KanjiDetail, KanjiListResponse } from "@/lib/types";

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
