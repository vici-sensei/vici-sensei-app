"use client";

import { Suspense } from "react";
import { prefetchKanjiDetail, useKanjiList } from "@/lib/client-data/kanji";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { BrowseListPage, ListSkeleton } from "../BrowseListPage";
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
    />
  );
}

export default function BrowseKanjiPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <KanjiListing />
    </Suspense>
  );
}
