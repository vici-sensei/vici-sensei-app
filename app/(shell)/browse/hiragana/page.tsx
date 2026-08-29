"use client";

import { Suspense } from "react";
import { useHiraganaList, useKanaRuleLabels } from "@/lib/client-data/kana";
import { BrowseKanaListPage, BrowseKanaListSkeleton } from "../BrowseKanaListPage";

function HiraganaListing() {
  const { data, status } = useHiraganaList();
  const { data: labels } = useKanaRuleLabels();
  return (
    <BrowseKanaListPage
      active="hiragana"
      placeholder="Search by character or romaji..."
      accentClass="text-accent-violet"
      data={data}
      status={status}
      labels={labels}
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
