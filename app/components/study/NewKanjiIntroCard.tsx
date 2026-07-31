import type { KanjiDetail, NewKanjiCandidate } from "@/lib/types";
import { Button } from "@/app/components/ui/Button";
import { LevelBadge } from "@/app/components/ui/LevelBadge";

interface Props {
  candidate: NewKanjiCandidate;
  detail: KanjiDetail | "loading" | "error" | undefined;
  disabled: boolean;
  onConfirm: () => void;
}

export function NewKanjiIntroCard({ candidate, detail, disabled, onConfirm }: Props) {
  const words = detail && detail !== "loading" && detail !== "error" ? detail.words : [];

  return (
    <div className="relative w-full max-w-[620px] rounded-3xl border border-border-soft bg-bg-cards px-10 py-14 text-center backdrop-blur-[10px]">
      <div className="mb-6 text-xs font-extrabold uppercase tracking-[1.5px] text-accent-gold">New kanji</div>
      <div className="mb-2 text-[clamp(4rem,12vw,6.5rem)] font-extrabold leading-none">{candidate.kanji}</div>
      <div className="mb-2.5 text-[1.3rem] font-bold text-white">{candidate.meanings?.join(", ")}</div>
      <div className="mb-1.5 flex flex-wrap justify-center gap-2.5">
        {candidate.kun_readings && candidate.kun_readings.length > 0 && (
          <div className="rounded-lg border border-border-soft bg-white/5 px-2.5 py-1 text-[0.95rem] font-bold text-text-muted [&>b]:text-white">
            Kun: <b>{candidate.kun_readings.join("、")}</b>
          </div>
        )}
        {candidate.on_readings && candidate.on_readings.length > 0 && (
          <div className="rounded-lg border border-border-soft bg-white/5 px-2.5 py-1 text-[0.95rem] font-bold text-text-muted [&>b]:text-white">
            On: <b>{candidate.on_readings.join("、")}</b>
          </div>
        )}
      </div>
      {detail === "loading" && <p className="mt-5 text-base leading-[1.6] text-text-muted">Loading example words…</p>}
      {words.length > 0 && (
        <div className="mt-7.5 grid grid-cols-3 gap-3 text-left max-[700px]:grid-cols-1">
          {words.map((w) => (
            <div className="rounded-xl border border-border-soft bg-white/[0.03] px-3.5 py-4" key={w.id}>
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <span className="text-[0.85rem] font-bold text-accent-blue">{w.vocabulary.kana_reading}</span>
                {w.vocabulary.jlpt_level && <LevelBadge level={w.vocabulary.jlpt_level} size="sm" />}
              </div>
              <div className="mb-1 text-2xl font-extrabold">{w.vocabulary.word}</div>
              <div className="text-[0.8rem] leading-[1.4] text-text-muted">{w.vocabulary.meanings?.join(", ")}</div>
              {w.vocabulary.usually_kana && (
                <div className="mt-1.5 text-[0.7rem] font-semibold italic text-accent-blue/70">
                  usually written in kana
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="mt-8.5">
        <Button className="w-full" disabled={disabled} onClick={onConfirm}>
          Next
        </Button>
      </div>
    </div>
  );
}
