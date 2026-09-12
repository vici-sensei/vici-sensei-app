"use client";

import { useKatakanaList } from "@/lib/client-data/kana";
import { ReadingTestPage } from "@/app/components/readingTest/ReadingTestPage";

export default function KatakanaReadingTestPage() {
  const { data: katakanaEntries } = useKatakanaList();
  return <ReadingTestPage testType="katakana" kanaEntries={katakanaEntries} />;
}
