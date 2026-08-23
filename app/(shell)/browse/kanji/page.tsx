"use client";

import { Suspense } from "react";
import { prefetchKanjiDetail, useKanjiList } from "@/lib/client-data/kanji";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { BrowseListPage, ListSkeleton } from "../BrowseListPage";
import { useRedirectIfKana } from "@/lib/browse/useRedirectIfKana";
import type { KanjiRow } from "@/lib/types";

function KanjiListing() {
  return (
    <BrowseListPage<KanjiRow>
      active="kanji"
      basePath="/browse/kanji"
      searchPlaceholder="Search by character, reading, or meaning..."
      useList={useKanjiList}
      prefetchDetail={prefetchKanjiDetail}
      itemKey={(row) => row.id}
      detailHref={(row) => `/browse/kanji/detail?id=${row.id}`}
      renderRow={(row) => (
        <>
          <div className="shrink-0 text-3xl">{row.kanji}</div>
          <div className="min-w-55 flex-1">
            <div className="mb-0.5 text-[1.05rem] font-bold">{row.meanings?.join(", ")}</div>
            <div className="text-[0.85rem] text-text-muted">
              kun: {row.kun_readings?.join("、") || "—"} &nbsp;·&nbsp; on: {row.on_readings?.join("、") || "—"}
            </div>
          </div>
          <LevelBadge level={row.level} className="ml-auto shrink-0" />
        </>
      )}
      renderPlaceholderRow={() => (
        <>
          <Skeleton className="h-9 w-7.5 shrink-0 rounded-md" />
          <div className="min-w-55 flex-1">
            <div className="mb-0.5 flex h-[25.2px] items-center">
              <Skeleton className="h-4 w-full" />
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[0.85rem] text-text-muted">
              <span>kun:</span>
              <Skeleton className="h-3.5 w-14" />
              <span>&middot;</span>
              <span>on:</span>
              <Skeleton className="h-3.5 w-14" />
            </div>
          </div>
          <LevelBadge level={null} loading className="ml-auto shrink-0" />
        </>
      )}
    />
  );
}

export default function BrowseKanjiPage() {
  useRedirectIfKana();
  return (
    <Suspense fallback={<ListSkeleton />}>
      <KanjiListing />
    </Suspense>
  );
}
