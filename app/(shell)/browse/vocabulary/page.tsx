"use client";

import { Suspense } from "react";
import { prefetchVocabularyDetail, useVocabularyList } from "@/lib/client-data/vocabulary";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { OtherMeaningsToggle } from "@/app/components/browse/OtherMeaningsToggle";
import { PlaceholderRubyWord } from "@/app/components/browse/PlaceholderRubyWord";
import { BrowseListPage, ListSkeleton } from "../BrowseListPage";
import { renderVocabularyWord } from "@/lib/study/furigana";
import { useRedirectIfKana } from "@/lib/browse/useRedirectIfKana";
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
          <div className="w-auto shrink-0 pt-[0.6em] text-3xl">{renderVocabularyWord(row)}</div>
          <div className="min-w-55 flex-1">
            <div className="mb-0.5 text-base font-bold">{row.primary_meanings?.join(", ")}</div>
            <OtherMeaningsToggle otherMeanings={row.other_meanings} className="mt-2" />
          </div>
          <LevelBadge level={row.jlpt_level} className="ml-auto shrink-0" />
        </>
      )}
      renderPlaceholderRow={() => (
        <>
          <PlaceholderRubyWord size="sm" />
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
