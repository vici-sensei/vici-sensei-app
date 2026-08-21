"use client";

import { Suspense } from "react";
import { useHiraganaList } from "@/lib/client-data/kana";
import { BrowseKanaListPage, BrowseKanaListSkeleton } from "../BrowseKanaListPage";

function HiraganaListing() {
  const { data, status } = useHiraganaList();
  return (
    <BrowseKanaListPage
      active="hiragana"
      placeholder="Search by character or romaji..."
      accentClass="text-accent-violet"
      data={data}
      status={status}
    />
  );
}

export default function BrowseHiraganaPage() {
  return (
    <Suspense fallback={<BrowseKanaListSkeleton />}>
      <HiraganaListing />
    </Suspense>
  );
}
