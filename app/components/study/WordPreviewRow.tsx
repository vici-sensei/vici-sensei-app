import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { renderWordWithFurigana } from "@/lib/study/furigana";
import type { NewKanjiIntroWord } from "@/lib/types";

/** One row of the word list shown on a new-kanji intro card. */
export function WordPreviewRow({ vocabulary }: { vocabulary: NewKanjiIntroWord["vocabulary"] }) {
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      <div className="shrink-0 pt-[0.4em] text-3xl leading-none">
        {renderWordWithFurigana(vocabulary.word, vocabulary.furiganas)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="leading-[1.4] text-text-muted">{vocabulary.meanings?.join(", ")}</div>
        {vocabulary.usually_kana && (
          <div className="mt-1 text-xs font-semibold italic text-accent-blue/70">usually written in kana</div>
        )}
      </div>
      {vocabulary.jlpt_level && <LevelBadge level={vocabulary.jlpt_level} size="sm" className="shrink-0" />}
    </div>
  );
}
