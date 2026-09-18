"use client";

import { fetchVocabularyDetail, fetchVocabularyList, type VocabularyListParams } from "@/lib/data/vocabulary";
import { readVocabularyListCache, writeVocabularyListCache } from "@/lib/browse/browseListCache";
import { readVocabularyDetailCache, writeVocabularyDetailCache } from "@/lib/browse/browseDetailCache";
import { createListDetailHooks } from "@/lib/client-data/createListDetailHooks";
import { useStudySettingsContext } from "@/lib/client-data/StudySettingsContext";
import { standardizeRomajiQuery } from "@/lib/study/romajiQuery";
import type { VocabularyDetailRow, VocabularyListResponse } from "@/lib/types";

/** `romajiFallback` is set by useVocabularyList below while the student has "Extended romaji" on. */
type VocabularyListFetchParams = VocabularyListParams & { romajiFallback?: boolean };

/** The plain list fetch, plus -- only when `romajiFallback` is set and the search found nothing --
 * one retry with the query rewritten to standard Hepburn romaji (syasin -> shashin, see
 * standardizeRomajiQuery). Only ever on an empty result: the search RPC also matches English
 * meanings, so a query that already finds something must never be rewritten. */
async function fetchVocabularyListWithRomajiFallback(params: VocabularyListFetchParams): Promise<VocabularyListResponse> {
  const { romajiFallback, ...listParams } = params;
  const result = await fetchVocabularyList(listParams);
  if (!romajiFallback || result.count > 0 || !listParams.search) return result;
  const standardized = standardizeRomajiQuery(listParams.search);
  return standardized ? fetchVocabularyList({ ...listParams, search: standardized }) : result;
}

const {
  useList: useBaseVocabularyList,
  prefetchList: prefetchVocabularyList,
  useDetail: useVocabularyDetail,
  prefetchDetail: prefetchVocabularyDetail,
} = createListDetailHooks<VocabularyListResponse, VocabularyListFetchParams, VocabularyDetailRow>({
  fetchList: fetchVocabularyListWithRomajiFallback,
  fetchDetail: fetchVocabularyDetail,
  readListCache: readVocabularyListCache,
  writeListCache: writeVocabularyListCache,
  readDetailCache: readVocabularyDetailCache,
  writeDetailCache: writeVocabularyDetailCache,
  listErrorFallback: "Failed to load vocabulary.",
  detailErrorFallback: "Failed to load vocabulary.",
});

/** Same signature as the hook createListDetailHooks builds; Browse's dictionary page only ever
 * runs inside the shell, where the study settings are always loaded before it renders. */
function useVocabularyList(params: VocabularyListParams) {
  const romajiFallback = useStudySettingsContext().data?.extended_romaji_enabled ?? false;
  return useBaseVocabularyList({ ...params, romajiFallback });
}

export { useVocabularyList, prefetchVocabularyList, useVocabularyDetail, prefetchVocabularyDetail };
