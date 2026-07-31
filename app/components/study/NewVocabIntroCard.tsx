import type { NewVocabCandidate } from "@/lib/types";
import { Button } from "@/app/components/ui/Button";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { renderWordWithFurigana } from "@/lib/study/furigana";

interface Props {
  candidate: NewVocabCandidate;
  disabled: boolean;
  onConfirm: () => void;
}

export function NewVocabIntroCard({ candidate, disabled, onConfirm }: Props) {
  const isUsuallyKana = candidate.usually_kana === true;

  return (
    <div className="relative w-full max-w-[560px] rounded-3xl border border-border-soft bg-bg-cards px-10 py-14 text-center backdrop-blur-[10px]">
      <div className="mb-6 text-xs font-extrabold uppercase tracking-[1.5px] text-accent-gold">New word</div>

      <div className="mb-2 pt-[0.6em] text-[clamp(4rem,12vw,6.5rem)] font-extrabold leading-none">
        {isUsuallyKana ? candidate.kana_reading : renderWordWithFurigana(candidate.word, candidate.furiganas)}
      </div>
      
      <div className="mb-2.5 text-[1.3rem] font-bold text-white">{candidate.meanings?.join(", ")}</div>

      <div className="mt-2.5 flex flex-wrap justify-center gap-2">
        {candidate.parts_of_speech?.map((pos) => (
          <div className="rounded-lg border border-border-soft bg-white/5 px-2.5 py-1 text-[0.95rem] font-bold text-text-muted" key={pos}>
            {pos}
          </div>
        ))}
        {candidate.jlpt_level && <LevelBadge level={candidate.jlpt_level} size="md" />}
      </div>

      <div className="mt-8.5">
        <Button className="w-full" disabled={disabled} onClick={onConfirm}>
          Next
        </Button>
      </div>
    </div>
  );
}
