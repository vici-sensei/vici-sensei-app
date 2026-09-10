"use client";

import { useRouter } from "next/navigation";
import { usePracticeQueue } from "./usePracticeQueue";
import { useViewportHeight } from "@/lib/useViewportHeight";
import { ReviewCardKanaReading } from "@/app/components/study/ReviewCardKanaReading";
import { QueueProgressBar } from "@/app/components/study/QueueProgressBar";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { Badge } from "@/app/components/ui/Badge";
import { Button } from "@/app/components/ui/Button";
import { FaArrowRotateRight } from "react-icons/fa6";

function StatBox({ value, label, accent }: { value: string; label: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl border border-border-soft bg-bg-cards px-3 py-[22px] backdrop-blur-[10px]">
      <div className={`mb-1 text-[1.7rem] font-extrabold ${accent ? "text-accent-blue" : ""}`}>{value}</div>
      <div className="text-[0.78rem] font-semibold text-text-muted">{label}</div>
    </div>
  );
}

/** Free-practice mode: a single, shuffled pass through every hiragana/katakana character the
 * user has already been introduced to -- plus, once a script is fully mastered, its
 * study_enabled = false bonus characters (badged "Bonus" by ReviewCardKanaReading) -- with no
 * effect on SRS state or review history (see usePracticeQueue's own doc comment). Unlike /study,
 * there is no Undo (nothing is ever recorded to undo) and no session to end, just a summary once
 * the deck runs out. */
export default function PracticePage() {
  const router = useRouter();
  useViewportHeight();
  const { status, error, current, correct, completed, total, wrongAnswers, actions } = usePracticeQueue();

  if (status === "loading") return <FullScreenLoader />;

  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 py-[60px] text-center">
        <div className="w-full max-w-[380px]">
          <h1 className="mb-2 text-lg font-bold text-white">Couldn&apos;t load your practice deck</h1>
          <p className="mb-6 text-[0.9rem] leading-[1.6] text-text-muted">{error ?? "Please try again."}</p>
          <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
            <FaArrowRotateRight className="h-3.5 w-3.5" />
            Try again
          </Button>
        </div>
      </div>
    );
  }

  if (status === "empty") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 py-[60px] text-center">
        <div className="w-full max-w-[380px]">
          <h1 className="mb-2 text-lg font-bold text-white">Nothing to practice yet</h1>
          <p className="mb-6 text-[0.9rem] leading-[1.6] text-text-muted">
            Learn a few hiragana or katakana characters first — they&apos;ll show up here once you have.
          </p>
          <Button variant="secondary" size="sm" onClick={() => router.push("/dashboard")}>
            Back to dashboard
          </Button>
        </div>
      </div>
    );
  }

  if (status === "done") {
    const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0;
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-[60px] before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_50%_15%,rgb(0_210_255/0.08)_0%,transparent_55%)]">
        <div className="relative w-full max-w-[420px] text-center">
          <Badge color="blue">Practice complete</Badge>
          <h1 className="mb-2 mt-4.5 text-[2.1rem] font-extrabold leading-[1.2] tracking-[-0.8px]">
            You went through every character.
          </h1>
          <div className="my-8.5 grid grid-cols-2 gap-3.5">
            <StatBox value={`${correct}/${total}`} label="Correct" />
            <StatBox value={`${accuracy}%`} label="Accuracy" accent />
          </div>
          {wrongAnswers.length > 0 && (
            <div className="mb-8.5 max-h-64 overflow-y-auto rounded-2xl border border-border-soft bg-bg-cards p-4 text-left backdrop-blur-[10px]">
              <div className="mb-3 text-[0.78rem] font-semibold uppercase tracking-[0.5px] text-text-muted">
                Missed ({wrongAnswers.length})
              </div>
              <ul className="flex flex-col gap-2">
                {wrongAnswers.map((item) => (
                  <li key={`${item.script}-${item.id}`} className="flex items-center justify-between text-[0.95rem]">
                    <span className="font-bold text-white">{item.character}</span>
                    <span className="text-text-muted">{item.romaji}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Button onClick={() => router.push("/dashboard")}>Back to Home</Button>
        </div>
      </div>
    );
  }

  if (!current) return <FullScreenLoader />;

  return (
    <div className="flex flex-col overflow-hidden bg-bg-main" style={{ height: "var(--app-height, 100dvh)" }}>
      <div className="shrink-0">
        <QueueProgressBar completed={completed} total={total} nextDueAt={null} clockOffsetMs={0} onExit={() => router.push("/dashboard")} />
      </div>
      <div className="flex flex-1 min-h-0 flex-col items-center justify-center px-4">
        <ReviewCardKanaReading key={current.key} card={current.card} disabled={false} onRate={actions.rate} hideDrillStreak />
      </div>
      <div className="shrink-0 px-4 py-2" />
    </div>
  );
}
