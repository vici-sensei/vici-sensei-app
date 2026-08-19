"use client";

import { Suspense } from "react";
import { prefetchVocabularyDetail, useVocabularyList } from "@/lib/client-data/vocabulary";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { BrowseListPage, ListSkeleton } from "../BrowseListPage";
import { renderWordWithFurigana } from "@/lib/study/furigana";
import type { VocabularyRow } from "@/lib/types";

function VocabularyListing() {
  return (
    <BrowseListPage<VocabularyRow>
      active="vocabulary"
      basePath="/browse/vocabulary"
      searchPlaceholder="Search by word, reading, or meaning..."
      useList={useVocabularyList}
      prefetchDetail={prefetchVocabularyDetail}
      itemKey={(row) => row.id}
      detailHref={(row) => `/browse/vocabulary/detail?id=${row.id}`}
      renderRow={(row) => (
        <>
          <div className="w-auto shrink-0 pt-[0.6em] text-3xl">{renderWordWithFurigana(row.word, row.furiganas)}</div>
          <div className="min-w-55 flex-1">
            <div className="mb-0.5 text-base font-bold">{row.meanings?.join(", ")}</div>
          </div>
          <LevelBadge level={row.jlpt_level} className="ml-auto shrink-0" />
        </>
      )}
    />
  );
}

export default function BrowseVocabularyPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <VocabularyListing />
    </Suspense>
  );
}
