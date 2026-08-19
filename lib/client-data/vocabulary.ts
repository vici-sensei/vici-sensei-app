"use client";

import { fetchVocabularyDetail, fetchVocabularyList, type VocabularyListParams } from "@/lib/data/vocabulary";
import { readVocabularyListCache, writeVocabularyListCache } from "@/lib/browse/browseListCache";
import { readVocabularyDetailCache, writeVocabularyDetailCache } from "@/lib/browse/browseDetailCache";
import { createListDetailHooks } from "@/lib/client-data/createListDetailHooks";
import type { VocabularyDetailRow, VocabularyListResponse } from "@/lib/types";

const {
  useList: useVocabularyList,
  prefetchList: prefetchVocabularyList,
  useDetail: useVocabularyDetail,
  prefetchDetail: prefetchVocabularyDetail,
} = createListDetailHooks<VocabularyListResponse, VocabularyListParams, VocabularyDetailRow>({
  fetchList: fetchVocabularyList,
  fetchDetail: fetchVocabularyDetail,
  readListCache: readVocabularyListCache,
  writeListCache: writeVocabularyListCache,
  readDetailCache: readVocabularyDetailCache,
  writeDetailCache: writeVocabularyDetailCache,
  listErrorFallback: "Failed to load vocabulary.",
  detailErrorFallback: "Failed to load vocabulary.",
});

export { useVocabularyList, prefetchVocabularyList, useVocabularyDetail, prefetchVocabularyDetail };
