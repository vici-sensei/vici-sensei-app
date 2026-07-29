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
      <div className="study-screen">
        <div className="study-stage">
          <p className="subtitle">{status === "ending" ? "Wrapping up your session…" : "Loading your study queue…"}</p>
        </div>
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="error-screen">
        <div className="error-card">
          <div className="error-icon-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h1>Something went wrong</h1>
          <p className="subtitle">{error ?? "Could not load your study queue."}</p>
          <Button onClick={() => window.location.reload()}>Retry</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="study-screen">
      <QueueProgressBar completed={completedCount} total={totalKnown} onExit={() => router.push("/dashboard")} />
      <div className="study-stage">
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
      <div className="study-footer">
        <UndoPill visible={lastReview !== null} disabled={actionPending} onUndo={actions.undoLast} />
      </div>
    </div>
  );
}
