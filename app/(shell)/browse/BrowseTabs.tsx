import Link from "next/link";
import { prefetchKanjiList } from "@/lib/client-data/kanji";
import { prefetchVocabularyList } from "@/lib/client-data/vocabulary";

export function BrowseTabs({ active }: { active: "kanji" | "vocabulary" }) {
  const tabClasses = (isActive: boolean) =>
    `cursor-pointer rounded-[9px] px-5 py-[9px] text-[0.88rem] font-bold ${
      isActive ? "bg-accent-red text-white" : "text-text-muted"
    }`;

  return (
    <div className="mb-5.5 flex justify-center md:block">
      <div className="inline-flex gap-1 rounded-xl border border-border-soft bg-white/[0.03] p-1">
        <Link
          href="/browse/kanji"
          className={tabClasses(active === "kanji")}
          onMouseEnter={() => prefetchKanjiList()}
          onFocus={() => prefetchKanjiList()}
          onTouchStart={() => prefetchKanjiList()}
        >
          Kanji
        </Link>
        <Link
          href="/browse/vocabulary"
          className={tabClasses(active === "vocabulary")}
          onMouseEnter={() => prefetchVocabularyList()}
          onFocus={() => prefetchVocabularyList()}
          onTouchStart={() => prefetchVocabularyList()}
        >
          Vocabulary
        </Link>
      </div>
    </div>
  );
}
