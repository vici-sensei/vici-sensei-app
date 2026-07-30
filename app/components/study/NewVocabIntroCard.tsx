import type { NewVocabCandidate } from "@/lib/types";
import { Button } from "@/app/components/ui/Button";

interface Props {
  candidate: NewVocabCandidate;
  disabled: boolean;
  onConfirm: () => void;
}

export function NewVocabIntroCard({ candidate, disabled, onConfirm }: Props) {
  return (
    <div className="relative w-full max-w-[560px] rounded-3xl border border-border-soft bg-bg-cards px-10 py-14 text-center backdrop-blur-[10px]">
      <div className="mb-6 text-xs font-extrabold uppercase tracking-[1.5px] text-accent-gold">New word</div>
      <div className="mb-1 text-[1.4rem] font-semibold text-text-muted">{candidate.kana_reading}</div>
      <div className="mb-1.5 text-5xl font-extrabold">{candidate.word}</div>
      <div className="mt-2.5 text-[1.3rem] font-bold text-white">{candidate.meanings?.join(", ")}</div>
      <div className="mt-2.5 flex flex-wrap justify-center gap-2">
        {candidate.parts_of_speech?.map((pos) => (
          <span className="rounded-lg border border-border-soft bg-white/5 px-2.5 py-1 text-[0.78rem] font-bold capitalize text-text-muted" key={pos}>
            {pos}
          </span>
        ))}
        {candidate.jlpt_level && (
          <span className="rounded-lg border border-border-soft bg-white/5 px-2.5 py-1 text-[0.78rem] font-bold capitalize text-text-muted">
            {candidate.jlpt_level}
          </span>
        )}
      </div>
      <div className="mt-8.5">
        <Button className="w-full" disabled={disabled} onClick={onConfirm}>
          Next
        </Button>
      </div>
    </div>
  );
}
