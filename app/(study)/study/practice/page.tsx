"use client";

import { Fragment, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePracticeQueue } from "./usePracticeQueue";
import { useViewportHeight } from "@/lib/useViewportHeight";
import { celebrate } from "@/lib/confetti";
import { ReviewCardKanaReading } from "@/app/components/study/ReviewCardKanaReading";
import { QueueProgressBar } from "@/app/components/study/QueueProgressBar";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { Badge } from "@/app/components/ui/Badge";
import { Button } from "@/app/components/ui/Button";
import { FaArrowRotateRight } from "react-icons/fa6";

function StatBox({ value, label, accent }: { value: string; label: string; accent?: "blue" | "gold" }) {
  const accentClass = accent === "gold" ? "text-accent-gold" : accent === "blue" ? "text-accent-blue" : "";
  return (
    <div className="rounded-2xl border border-border-soft bg-bg-cards px-3 py-[22px] backdrop-blur-[10px]">
      <div className={`mb-1 text-xl font-extrabold ${accentClass}`}>{value}</div>
      <div className="text-sm font-semibold text-text-muted">{label}</div>
    </div>
  );
}

/** Formats screen-on practice time as m:ss, or h:mm:ss past an hour -- see usePracticeQueue's
 * activeMs, which already excludes screen-off/backgrounded and off-route time. */
function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const paddedSeconds = String(seconds).padStart(2, "0");
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${paddedSeconds}`;
  return `${minutes}:${paddedSeconds}`;
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
  const { status, error, current, correct, completed, total, wrongAnswers, activeMs, actions } = usePracticeQueue();
  const isPerfect = status === "done" && total > 0 && correct === total;

  useEffect(() => {
    if (isPerfect) void celebrate();
  }, [isPerfect]);

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
    const bgGlow = isPerfect
      ? "before:bg-[radial-gradient(circle_at_50%_15%,rgb(255_210_0/0.12)_0%,transparent_55%)]"
      : "before:bg-[radial-gradient(circle_at_50%_15%,rgb(0_210_255/0.08)_0%,transparent_55%)]";
    return (
      <div
        className={`relative flex h-screen items-center justify-center overflow-hidden overflow-y-auto p-4 before:pointer-events-none before:absolute before:inset-0 ${bgGlow}`}
      >
        <div className="relative w-full max-w-[420px] flex flex-col items-center justify-evenly text-center gap-4 h-full">
          <div className="flex flex-col items-center gap-2">
            <Badge color={isPerfect ? "gold" : "blue"}>{isPerfect ? "Perfect!" : "Session complete"}</Badge>
            <h1 className="text-2xl font-extrabold leading-[1.2] tracking-[-0.8px]">
              {isPerfect ? "Perfect score! You went through every character." : "You went through every character!"}
            </h1>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <StatBox value={`${correct}/${total}`} label="Correct" />
            <StatBox value={`${accuracy}%`} label="Accuracy" accent={isPerfect ? "gold" : "blue"} />
            <StatBox value={formatDuration(activeMs)} label="Time" />
          </div>
          {wrongAnswers.length > 0 && (
            <div className="min-h-32 overflow-y-auto rounded-2xl border border-border-soft bg-bg-cards p-4 text-left backdrop-blur-[10px] w-fit mx-auto">
              <div className="mb-3 text-[0.78rem] font-semibold uppercase tracking-[0.5px] text-text-muted text-center">
                Missed ({wrongAnswers.length})
              </div>
              <div className="grid grid-cols-[1fr_1fr_1fr] gap-x-1 gap-y-2 text-[0.9rem] justify-center items-center">
                <div className="text-center text-[0.68rem] font-semibold uppercase tracking-[0.5px] text-text-muted">Kana</div>
                <div className="text-center text-[0.68rem] font-semibold uppercase tracking-[0.5px] text-text-muted">Correct</div>
                <div className="text-center text-[0.68rem] font-semibold uppercase tracking-[0.5px] text-text-muted">You wrote</div>
                {wrongAnswers.map((item) => (
                  <Fragment key={`${item.script}-${item.id}`}>
                    <div className="text-center font-bold text-white">{item.character}</div>
                    <div className="text-center text-accent-green">{item.romaji}</div>
                    <div className="text-center text-accent-red">{item.userAnswer || "—"}</div>
                  </Fragment>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-3">
            {wrongAnswers.length > 0 && (
              <Button variant="secondary" onClick={actions.retryMistakes}>
                Retry
              </Button>
            )}
            <Button onClick={() => router.push("/dashboard")}>Home</Button>
          </div>
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
