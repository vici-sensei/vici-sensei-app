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
import { FaArrowRotateRight } from "react-icons/fa6";

export default function StudyPage() {
  const router = useRouter();
  const { status, error, current, completedCount, totalKnown, lastReview, actionPending, actions } =
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
