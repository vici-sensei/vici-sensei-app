"use client";

import { Suspense } from "react";
import { useKatakanaList, useKanaRuleLabels } from "@/lib/client-data/kana";
import { BrowseKanaListPage, BrowseKanaListSkeleton } from "../BrowseKanaListPage";

function KatakanaListing() {
  const { data, status } = useKatakanaList();
  const { data: labels } = useKanaRuleLabels();
  return (
    <BrowseKanaListPage
      active="katakana"
      placeholder="Search by character or romaji..."
      accentClass="text-accent-orange"
      data={data}
      status={status}
      labels={labels}
    />
  );
}

export default function BrowseKatakanaPage() {
  return (
    <Suspense fallback={<BrowseKanaListSkeleton />}>
      <KatakanaListing />
    </Suspense>
  );
}
