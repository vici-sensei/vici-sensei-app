import type { NewVocabCandidate } from "@/lib/types";
import { Button } from "@/app/components/ui/Button";
import { LevelBadge } from "@/app/components/ui/LevelBadge";

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
      <div
        className="mb-1 text-[1.4rem] font-semibold text-text-muted"
        aria-hidden={isUsuallyKana}
        {...(isUsuallyKana ? { style: { visibility: "hidden" as const } } : {})}
      >
        {candidate.kana_reading || " "}
      </div>
      <div className="mb-1.5 text-5xl font-extrabold">{isUsuallyKana ? candidate.kana_reading : candidate.word}</div>
      <div className="mt-2.5 space-y-1">
        <div className="text-[1.3rem] font-bold text-white">
          {candidate.meanings?.join(", ")}
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap justify-center gap-2">
        {candidate.parts_of_speech?.map((pos) => (
          <span className="rounded-lg border border-border-soft bg-white/5 px-2.5 py-1 text-[0.78rem] font-bold text-text-muted" key={pos}>
            {pos}
          </span>
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
