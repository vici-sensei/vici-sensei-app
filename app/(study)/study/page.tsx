"use client";

import { useRouter } from "next/navigation";
import { useStudyQueue } from "./useStudyQueue";
import { QueueProgressBar } from "@/app/components/study/QueueProgressBar";
import { UndoPill } from "@/app/components/study/UndoPill";
import { ReviewCardKanjiMeaning } from "@/app/components/study/ReviewCardKanjiMeaning";
import { ReviewCardKanjiReading } from "@/app/components/study/ReviewCardKanjiReading";
import { ReviewCardVocabMeaning } from "@/app/components/study/ReviewCardVocabMeaning";
import { NewKanjiIntroCard } from "@/app/components/study/NewKanjiIntroCard";
import { NewVocabIntroCard } from "@/app/components/study/NewVocabIntroCard";
import { Button } from "@/app/components/ui/Button";

export default function StudyPage() {
  const router = useRouter();
  const { status, error, current, completedCount, totalKnown, kanjiDetails, lastReview, actionPending, actions } =
    useStudyQueue();

  if (status === "loading" || status === "ending" || !current) {
    return (
      <div className="flex min-h-screen flex-col bg-bg-main">
        <div className="flex flex-1 items-center justify-center px-6 pb-15 pt-5">
          <p className="text-base leading-[1.6] text-text-muted">
            {status === "ending" ? "Wrapping up your session…" : "Loading your study queue…"}
          </p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-[60px] text-center before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_50%_20%,rgb(255_74_90/0.1)_0%,transparent_55%)]">
        <div className="relative w-full max-w-[440px]">
          <div className="mx-auto mb-5.5 flex h-16 w-16 items-center justify-center rounded-full border border-accent-red/30 bg-accent-red/10">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 text-accent-red">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h1 className="mb-2.5 text-2xl font-extrabold">Something went wrong</h1>
          <p className="mb-7 text-base leading-[1.6] text-text-muted">{error ?? "Could not load your study queue."}</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg-main">
      <QueueProgressBar completed={completedCount} total={totalKnown} onExit={() => router.push("/dashboard")} />
      <div className="flex flex-1 items-center justify-center px-6 pb-15 pt-5">
        {current.kind === "review" && current.card.exercise_type === "kanji_meaning" && (
          <ReviewCardKanjiMeaning key={current.key} card={current.card} disabled={actionPending} onRate={actions.rate} />
        )}
        {current.kind === "review" && current.card.exercise_type === "kanji_reading" && (
          <ReviewCardKanjiReading key={current.key} card={current.card} disabled={actionPending} onRate={actions.rate} />
        )}
        {current.kind === "review" && current.card.exercise_type === "vocab_meaning" && (
          <ReviewCardVocabMeaning key={current.key} card={current.card} disabled={actionPending} onRate={actions.rate} />
        )}
        {current.kind === "new_kanji" && (
          <NewKanjiIntroCard
            key={current.key}
            candidate={current.candidate}
            detail={kanjiDetails[current.candidate.id]}
            disabled={actionPending}
            onConfirm={() => actions.introduceKanji(current)}
          />
        )}
        {current.kind === "new_vocab" && (
          <NewVocabIntroCard
            key={current.key}
            candidate={current.candidate}
            disabled={actionPending}
            onConfirm={() => actions.introduceVocab(current)}
          />
        )}
      </div>
      <div className="flex min-h-14 justify-center px-6 pb-7">
        <UndoPill visible={lastReview !== null} disabled={actionPending} onUndo={actions.undoLast} />
      </div>
    </div>
  );
}
