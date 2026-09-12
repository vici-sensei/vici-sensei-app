"use client";

import { useHiraganaList } from "@/lib/client-data/kana";
import { ReadingTestPage } from "@/app/components/readingTest/ReadingTestPage";

export default function HiraganaReadingTestPage() {
  const { data: hiraganaEntries } = useHiraganaList();
  return <ReadingTestPage testType="hiragana" kanaEntries={hiraganaEntries} />;
}
