import type { NewKanjiCandidate } from "@/lib/types";
import { Button } from "@/app/components/ui/Button";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { renderWordWithFurigana } from "@/lib/study/furigana";

interface Props {
  candidate: NewKanjiCandidate;
  disabled: boolean;
  onConfirm: () => void;
}

export function NewKanjiIntroCard({ candidate, disabled, onConfirm }: Props) {
  const words = candidate.words;

  return (
    <div className="relative w-full max-w-[620px] rounded-3xl border border-border-soft bg-bg-cards px-4 py-4 md:px-10 md:py-14 text-center backdrop-blur-[10px]">
      {candidate.level && (
        <LevelBadge level={candidate.level} size="lg" className="absolute right-2 top-2 md:right-4 md:top-4 z-10" />
      )}
      <div className="mb-6 text-xs font-extrabold uppercase tracking-[1.5px] text-accent-gold">New kanji</div>

      <div className="mb-2 text-[clamp(4rem,12vw,6.5rem)] font-medium leading-none">{candidate.kanji}</div>
      
      <div className="mb-2 md:mb-2.5 text-[1.3rem] font-bold text-white">{candidate.meanings?.join(", ")}</div>

      <div className="mb-4 md:mb-2 flex flex-wrap justify-center gap-2 md:gap-2.5">
        {candidate.kun_readings && candidate.kun_readings.length > 0 && (
          <div className="rounded-lg border border-border-soft bg-white/5 px-2.5 md:py-1 text-[0.95rem] font-bold text-text-muted [&>b]:text-white">
            Kun: <b>{candidate.kun_readings.join("、")}</b>
          </div>
        )}
        {candidate.on_readings && candidate.on_readings.length > 0 && (
          <div className="rounded-lg border border-border-soft bg-white/5 px-2.5 md:py-1 text-[0.95rem] font-bold text-text-muted [&>b]:text-white">
            On: <b>{candidate.on_readings.join("、")}</b>
          </div>
        )}
      </div>
      
      {words.length > 0 && (
        <div className="md:mt-7 grid grid-cols-3 gap-2 md:gap-3 text-left max-[768px]:grid-cols-1">
          {words.map((w) => (
            <div className="relative rounded-xl border border-border-soft bg-white/[0.03] pl-2 pr-9 py-1 md:px-3.5 md:py-4" key={w.id}>
              {w.vocabulary.jlpt_level && (
                <LevelBadge level={w.vocabulary.jlpt_level} size="sm" className="absolute right-1 top-1 md:right-2 md:top-2 z-10" />
              )}
              <div className="md:mb-3 md:pt-[0.6em] text-4xl md:text-5xl">
                {renderWordWithFurigana(w.vocabulary.word, w.vocabulary.furiganas)}
              </div>
              <div className="leading-[1.4] text-text-muted">{w.vocabulary.meanings?.join(", ")}</div>
              {w.vocabulary.usually_kana && (
                <div className="text-sm mt-3 font-semibold italic text-accent-blue/70">
                  usually written in kana
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="mt-4 md:mt-8.5">
        <Button className="w-full" disabled={disabled} onClick={onConfirm}>
          Next
        </Button>
      </div>
    </div>
  );
}
