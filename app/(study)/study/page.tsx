"use client";

import { useRouter } from "next/navigation";
import { useStudyQueue } from "./useStudyQueue";
import { useViewportHeight } from "@/lib/useViewportHeight";
import { QueueProgressBar } from "@/app/components/study/QueueProgressBar";
import { UndoPill } from "@/app/components/study/UndoPill";
import { ReviewCardKanjiMeaning } from "@/app/components/study/ReviewCardKanjiMeaning";
import { ReviewCardKanjiReading } from "@/app/components/study/ReviewCardKanjiReading";
import { ReviewCardVocabMeaning } from "@/app/components/study/ReviewCardVocabMeaning";
import { NewKanjiIntroCard } from "@/app/components/study/NewKanjiIntroCard";
import { NewVocabIntroCard } from "@/app/components/study/NewVocabIntroCard";
import { Button } from "@/app/components/ui/Button";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { FaArrowRotateRight, FaXmark } from "react-icons/fa6";

function StudyQueueSkeleton() {
  return (
    <div className="flex flex-col bg-bg-main" style={{ minHeight: "var(--app-height, 100dvh)" }}>
      <div className="px-7 py-5">
        <div className="flex items-center gap-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-text-muted/40 [&>svg]:h-4 [&>svg]:w-4">
            <FaXmark />
          </div>
          <Skeleton className="h-1.5 flex-1 rounded-full" />
          <Skeleton className="h-4 w-12 shrink-0" />
        </div>
      </div>
      <div className="flex flex-1 items-center justify-center px-6 pb-15 pt-5">
        <div className="relative w-full max-w-[620px] rounded-3xl border border-border-soft bg-bg-cards px-4 py-4 md:px-10 md:py-14 text-center backdrop-blur-[10px]">
          <Skeleton className="mx-auto mb-6 h-3 w-28" />
          <Skeleton className="mx-auto mb-2 h-24 w-24 rounded-2xl" />
          <Skeleton className="mx-auto mt-1 h-3.5 w-48" />
          <div className="mt-7 flex flex-col items-center gap-3">
            <Skeleton className="h-11 w-full rounded-lg" />
            <Skeleton className="h-11 w-full rounded-xl" />
          </div>
        </div>
      </div>
      <div className="min-h-14 px-6 pb-7" />
    </div>
  );
}

export default function StudyPage() {
  const router = useRouter();
  useViewportHeight();
  const { status, error, current, completedCount, totalKnown, nextDueAt, lastReview, actionPending, actions } =
    useStudyQueue();

  if (status === "loading" || status === "ending" || !current) {
    return <StudyQueueSkeleton />;
  }

  if (status === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 py-[60px] text-center">
        <div className="w-full max-w-[380px]">
          <h1 className="mb-2 text-lg font-bold text-white">Couldn&apos;t load your queue</h1>
          <p className="mb-6 text-[0.9rem] leading-[1.6] text-text-muted">{error ?? "Please try again."}</p>
          <Button variant="secondary" size="sm" onClick={() => window.location.reload()}>
            <FaArrowRotateRight className="h-3.5 w-3.5" />
            Try again
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col bg-bg-main" style={{ minHeight: "var(--app-height, 100dvh)" }}>
      <QueueProgressBar
        completed={completedCount}
        total={totalKnown}
        nextDueAt={nextDueAt}
        onExit={() => router.push("/dashboard")}
      />
      <div className="flex flex-1 flex-col items-center px-4 md:px-6 md:py-5">
        {/* my-auto (not justify-center) so that when the card is taller than the
            remaining space it aligns to the top instead of clipping equally on both ends;
            the page itself scrolls (progress bar included) rather than just this section.
            min-h-max stops the flex row from ever shrinking the card below its natural
            content height (the default flex-shrink would otherwise squeeze it shorter
            than its content, leaving text/buttons rendered outside the card's background). */}
        <div className="my-auto flex w-full min-h-max justify-center">
          {current.kind === "review" && current.card.exercise_type === "kanji_meaning" && (
            <ReviewCardKanjiMeaning key={current.key} card={current.card} disabled={false} onRate={actions.rate} />
          )}
          {current.kind === "review" && current.card.exercise_type === "kanji_reading" && (
            <ReviewCardKanjiReading key={current.key} card={current.card} disabled={false} onRate={actions.rate} />
          )}
          {current.kind === "review" && current.card.exercise_type === "vocab_meaning" && (
            <ReviewCardVocabMeaning key={current.key} card={current.card} disabled={false} onRate={actions.rate} />
          )}
          {current.kind === "new_kanji" && (
            <NewKanjiIntroCard
              key={current.key}
              candidate={current.candidate}
              disabled={false}
              onConfirm={() => actions.introduceKanji(current)}
            />
          )}
          {current.kind === "new_vocab" && (
            <NewVocabIntroCard
              key={current.key}
              candidate={current.candidate}
              disabled={false}
              onConfirm={() => actions.introduceVocab(current)}
            />
          )}
        </div>
      </div>
      {<div className="flex md:min-h-14 justify-center px-4 py-2 md:px-6 md:py-7">
        <UndoPill visible={lastReview !== null} disabled={actionPending} onUndo={actions.undoLast} />
      </div>}
    </div>
  );
}
