import Link from "next/link";
import { prefetchKanjiList } from "@/lib/client-data/kanji";
import { prefetchVocabularyList } from "@/lib/client-data/vocabulary";
import { prefetchHiraganaList, prefetchKatakanaList } from "@/lib/client-data/kana";
import { useStudySettingsContext } from "@/lib/client-data/StudySettingsContext";

type BrowseTab = "kanji" | "vocabulary" | "hiragana" | "katakana";

export function BrowseTabs({ active }: { active: BrowseTab }) {
  const { data: settings } = useStudySettingsContext();
  // On kana there's nothing to browse yet for kanji/vocabulary -- only Hiragana/Katakana show.
  // On standard, all four show, kana ones last as a permanent reference.
  const isKana = settings?.study_track === "kana";

  const tabClasses = (isActive: boolean) =>
    `cursor-pointer rounded-[9px] px-5 py-[9px] text-[0.88rem] font-bold ${
      isActive ? "bg-accent-red text-white" : "text-text-muted"
    }`;

  return (
    <div className="mb-5.5 flex justify-center md:block">
      <div className="inline-flex flex-wrap justify-center gap-1 rounded-xl border border-border-soft bg-white/[0.03] p-1">
        {!isKana && (
          <>
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
          </>
        )}
        <Link
          href="/browse/hiragana"
          className={tabClasses(active === "hiragana")}
          onMouseEnter={() => prefetchHiraganaList()}
          onFocus={() => prefetchHiraganaList()}
          onTouchStart={() => prefetchHiraganaList()}
        >
          Hiragana
        </Link>
        <Link
          href="/browse/katakana"
          className={tabClasses(active === "katakana")}
          onMouseEnter={() => prefetchKatakanaList()}
          onFocus={() => prefetchKatakanaList()}
          onTouchStart={() => prefetchKatakanaList()}
        >
          Katakana
        </Link>
      </div>
    </div>
  );
}
