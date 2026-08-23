"use client";

import { Suspense } from "react";
import { prefetchVocabularyDetail, useVocabularyList } from "@/lib/client-data/vocabulary";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { BrowseListPage, ListSkeleton } from "../BrowseListPage";
import { renderWordWithFurigana } from "@/lib/study/furigana";
import { useRedirectIfKana } from "@/lib/browse/useRedirectIfKana";
import type { VocabularyRow } from "@/lib/types";

// Most vocabulary words are 2 kanji, each with its own 2-character furigana reading above it --
// mirror that shape (two ruby-sized blocks side by side) instead of one undifferentiated bar.
function PlaceholderWord() {
  return (
    <div className="flex h-[57.3px] shrink-0 items-end gap-1.5">
      {[0, 1].map((k) => (
        <div key={k} className="flex flex-col items-center gap-1">
          <Skeleton className="h-3 w-5 rounded" />
          <Skeleton className="h-9 w-8 rounded-md" />
        </div>
      ))}
    </div>
  );
}

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
      renderPlaceholderRow={() => (
        <>
          <PlaceholderWord />
          <div className="min-w-55 flex-1">
            <div className="mb-0.5 flex h-6 items-center">
              <Skeleton className="h-4 w-full" />
            </div>
          </div>
          <LevelBadge level={null} loading className="ml-auto shrink-0" />
        </>
      )}
    />
  );
}

export default function BrowseVocabularyPage() {
  useRedirectIfKana();
  return (
    <Suspense fallback={<ListSkeleton />}>
      <VocabularyListing />
    </Suspense>
  );
}
