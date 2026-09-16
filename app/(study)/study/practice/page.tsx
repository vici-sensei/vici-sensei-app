"use client";

import { Fragment, useEffect } from "react";
import { useRouter } from "next/navigation";
import { usePracticeQueue } from "./usePracticeQueue";
import { useViewportHeight } from "@/lib/useViewportHeight";
import { celebrate } from "@/lib/confetti";
import { ReviewCardKanaReading } from "@/app/components/study/ReviewCardKanaReading";
import { ReviewCardKanjiMeaning } from "@/app/components/study/ReviewCardKanjiMeaning";
import { ReviewCardKanjiReading } from "@/app/components/study/ReviewCardKanjiReading";
import { ReviewCardVocabMeaning } from "@/app/components/study/ReviewCardVocabMeaning";
import { PracticeCategoryPicker } from "@/app/components/study/PracticeCategoryPicker";
import { QueueProgressBar } from "@/app/components/study/QueueProgressBar";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { Badge } from "@/app/components/ui/Badge";
import { Button } from "@/app/components/ui/Button";
import { FaArrowRotateRight } from "react-icons/fa6";
import type { DueCard, Rating } from "@/lib/types";
import type { PracticeMissedCard } from "@/lib/study/practicePool";
import { practiceCardKey } from "@/lib/study/practicePool";

/** Dispatches to the right review card for whatever exercise_type toDueCard built (see
 * usePracticeQueue.ts) -- every one of them is forced into drill_mode there, so this always
 * renders the simplified correct/incorrect + Continue presentation regardless of kind. */
function PracticeCard({ card, onRate }: { card: DueCard; onRate: (card: DueCard, rating: Rating) => void }) {
  switch (card.exercise_type) {
    case "hiragana_reading":
    case "katakana_reading":
      return <ReviewCardKanaReading card={card} disabled={false} onRate={onRate} hideDrillStreak />;
    case "kanji_meaning":
      return <ReviewCardKanjiMeaning card={card} disabled={false} onRate={onRate} />;
    case "kanji_reading":
      return <ReviewCardKanjiReading card={card} disabled={false} onRate={onRate} />;
    case "vocab_meaning":
      return <ReviewCardVocabMeaning card={card} disabled={false} onRate={onRate} />;
  }
}

/** What the "done" summary's missed-cards table shows for one card, regardless of kind. */
function missedRowContent(item: PracticeMissedCard): { prompt: string; correct: string } {
  switch (item.kind) {
    case "hiragana":
    case "katakana":
      return { prompt: item.character, correct: item.romaji };
    case "kanji_meaning":
      return { prompt: item.kanjiChar, correct: item.meanings.join(", ") };
    case "kanji_reading":
      return { prompt: item.word, correct: item.kanaReading ?? item.romajiReading ?? "" };
    case "vocab_meaning":
      return { prompt: item.word, correct: item.primaryMeanings.join(", ") };
  }
}

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

/** Free-practice mode: lets the user pick which categories (hiragana/katakana/kanji/vocabulary)
 * to practice, then a single shuffled pass through every card of those kinds they've already
 * been introduced to -- plus, once both kana scripts are fully mastered, their study_enabled =
 * false bonus characters (badged "Bonus" by ReviewCardKanaReading) -- with no effect on SRS
 * state or review history (see usePracticeQueue's own doc comment). Unlike /study, there is no
 * Undo (nothing is ever recorded to undo) and no session to end, just a summary once the deck
 * runs out -- which (see usePracticeQueue) survives a refresh indefinitely until the user
 * explicitly retries or starts a new practice. */
export default function PracticePage() {
  const router = useRouter();
  useViewportHeight();
  const { status, error, current, correct, completed, total, wrongAnswers, activeMs, availableCategories, initialCategories, actions } =
    usePracticeQueue();
  const isPerfect = status === "done" && total > 0 && correct === total;

  useEffect(() => {
    if (isPerfect) void celebrate();
  }, [isPerfect]);

  if (status === "setup") {
    return (
      <div className="flex flex-col gap-4 h-screen min-h-full items-center justify-between px-4 pb-8 pt-4">
        <PracticeCategoryPicker
          availableCategories={availableCategories}
          initialCategories={initialCategories}
          onStart={actions.startPractice}
          onClose={() => router.push("/dashboard")}
        />
      </div>
    );
  }

  if (status === "loading") return <FullScreenLoader />;

  if (status === "error") {
    return (
      <div className="flex flex-col gap-4 h-screen min-h-full items-center justify-between px-4 pb-8 pt-4 text-center">
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
      <div className="flex flex-col gap-4 h-screen min-h-full items-center justify-between px-4 pb-8 pt-4 text-center">
        <div className="w-full max-w-[380px]">
          <h1 className="mb-2 text-lg font-bold text-white">Nothing to practice yet</h1>
          <p className="mb-6 text-[0.9rem] leading-[1.6] text-text-muted">
            You haven&apos;t been introduced to anything in the categories you picked yet — try a different combination, or come back once
            you&apos;ve learned a bit more.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Button variant="secondary" size="sm" onClick={actions.goToSetup}>
              Change categories
            </Button>
            <Button size="sm" onClick={() => router.push("/dashboard")}>
              Back to dashboard
            </Button>
          </div>
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
              {isPerfect ? "Perfect score! You went through every card." : "You went through every card!"}
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
                <div className="text-center text-[0.68rem] font-semibold uppercase tracking-[0.5px] text-text-muted">Card</div>
                <div className="text-center text-[0.68rem] font-semibold uppercase tracking-[0.5px] text-text-muted">Correct</div>
                <div className="text-center text-[0.68rem] font-semibold uppercase tracking-[0.5px] text-text-muted">You wrote</div>
                {wrongAnswers.map((item) => {
                  const { prompt, correct: correctAnswer } = missedRowContent(item);
                  return (
                    <Fragment key={practiceCardKey(item)}>
                      <div className="text-center font-bold text-white">{prompt}</div>
                      <div className="text-center text-accent-green">{correctAnswer}</div>
                      <div className="text-center text-accent-red">{item.userAnswer || "—"}</div>
                    </Fragment>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-3">
            {wrongAnswers.length > 0 && (
              <Button variant="secondary" onClick={actions.retryMistakes}>
                Retry missed cards
              </Button>
            )}
            <Button variant="secondary" onClick={actions.goToSetup}>
              New practice
            </Button>
            <Button
              onClick={() => {
                actions.goToSetup();
                router.push("/dashboard");
              }}
            >
              Home
            </Button>
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
        <PracticeCard key={current.key} card={current.card} onRate={actions.rate} />
      </div>
      <div className="shrink-0 px-4 py-2" />
    </div>
  );
}
