"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useStudyQueue } from "./useStudyQueue";
import { useViewportHeight } from "@/lib/useViewportHeight";
import { QueueProgressBar } from "@/app/components/study/QueueProgressBar";
import { UndoPill } from "@/app/components/study/UndoPill";
import { ReviewCardKanjiMeaning } from "@/app/components/study/ReviewCardKanjiMeaning";
import { ReviewCardKanjiReading } from "@/app/components/study/ReviewCardKanjiReading";
import { ReviewCardVocabMeaning } from "@/app/components/study/ReviewCardVocabMeaning";
import { ReviewCardKanaReading } from "@/app/components/study/ReviewCardKanaReading";
import { NewKanjiIntroCard } from "@/app/components/study/NewKanjiIntroCard";
import { NewVocabIntroCard } from "@/app/components/study/NewVocabIntroCard";
import { NewKanaIntroCard } from "@/app/components/study/NewKanaIntroCard";
import { NewKanaRuleIntroCard } from "@/app/components/study/NewKanaRuleIntroCard";
import { JlptLevelUpModal } from "@/app/components/study/JlptLevelUpModal";
import { KanaGraduationModal } from "@/app/components/study/KanaGraduationModal";
import { Button } from "@/app/components/ui/Button";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { FaArrowRotateRight, FaXmark } from "react-icons/fa6";

function StudyQueueSkeleton() {
  return (
    <div className="flex flex-col overflow-hidden bg-bg-main" style={{ height: "var(--app-height, 100dvh)" }}>
      <div className="shrink-0 px-4 pt-1 pb-2">
        <div className="flex items-center gap-4">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/5 text-text-muted/40 [&>svg]:h-4 [&>svg]:w-4">
            <FaXmark />
          </div>
          <div className="flex flex-1 flex-col mt-5">
            <Skeleton className="h-1.5 w-full rounded-full" />
            <p className="invisible text-center text-[0.75rem] text-text-muted/70">Plus another card in 0s</p>
          </div>
          <Skeleton className="h-4 w-12 shrink-0" />
        </div>
      </div>
      <div className="flex flex-1 min-h-0 items-center justify-center px-4">
        <div className="relative w-full max-w-[560px] max-h-full overflow-y-auto rounded-3xl border border-border-soft bg-bg-cards px-4 py-4 text-center backdrop-blur-[10px]">
          <Skeleton className="mx-auto mb-6 h-3 w-24" />
          <Skeleton className="mx-auto mb-2 h-8 w-16 rounded-lg" />
          <Skeleton className="mx-auto mt-1 h-4 w-52" />
          <div className="mt-7 flex flex-col items-center gap-3">
            <Skeleton className="h-[46px] w-full rounded-lg" />
            <Skeleton className="h-[52px] w-full rounded-xl" />
          </div>
        </div>
      </div>
      <div className="shrink-0 px-4 py-2" />
    </div>
  );
}

export default function StudyPage() {
  const router = useRouter();
  useViewportHeight();
  const {
    status,
    error,
    current,
    completedCount,
    totalKnown,
    nextDueAt,
    nextDueStatus,
    clockOffsetMs,
    lastReview,
    levelUpResult,
    kanaGraduationResult,
    actionPending,
    cardPending,
    undoDisabled,
    actions,
  } = useStudyQueue();
  // Set while the current card has an un-rated Check showing, so Undo can cancel that
  // Check (letting the user fix a typo) instead of undoing the previously submitted review.
  const [cancelCheck, setCancelCheck] = useState<(() => void) | null>(null);
  // setCancelCheck expects a plain value here, but a bare function argument is treated by
  // useState as an updater fn and invoked immediately -- wrap it so React always stores it as-is.
  const handleCancelableChange = useCallback((cancel: (() => void) | null) => {
    setCancelCheck(() => cancel);
  }, []);

  const handleUndo = () => {
    if (cancelCheck) {
      cancelCheck();
      return;
    }
    actions.undoLast();
  };

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
    <div className="flex flex-col overflow-hidden bg-bg-main" style={{ height: "var(--app-height, 100dvh)" }}>
      <div className="shrink-0">
        <QueueProgressBar
          completed={completedCount}
          total={totalKnown}
          nextDueAt={nextDueStatus === "review" ? nextDueAt : null}
          clockOffsetMs={clockOffsetMs}
          onExit={() => router.push("/dashboard")}
        />
      </div>
      {/* items-center + justify-center safely center the card because the card itself
          (StudyCardShell) is capped at max-h-full with its own overflow-y-auto -- it can
          never grow past this section, so overflow becomes an internal card scrollbar
          instead of pushing the page past 100vh. */}
      <div className="flex flex-1 min-h-0 flex-col items-center justify-center px-4">
        {current.kind === "review" && current.card.exercise_type === "kanji_meaning" && (
          <ReviewCardKanjiMeaning
            key={current.key}
            card={current.card}
            disabled={false}
            onRate={actions.rate}
            onCancelableChange={undoDisabled ? undefined : handleCancelableChange}
          />
        )}
        {current.kind === "review" && current.card.exercise_type === "kanji_reading" && (
          <ReviewCardKanjiReading
            key={current.key}
            card={current.card}
            disabled={false}
            onRate={actions.rate}
            onCancelableChange={undoDisabled ? undefined : handleCancelableChange}
          />
        )}
        {current.kind === "review" && current.card.exercise_type === "vocab_meaning" && (
          <ReviewCardVocabMeaning
            key={current.key}
            card={current.card}
            disabled={false}
            onRate={actions.rate}
            onCancelableChange={undoDisabled ? undefined : handleCancelableChange}
          />
        )}
        {current.kind === "review" &&
          (current.card.exercise_type === "hiragana_reading" || current.card.exercise_type === "katakana_reading") && (
            <ReviewCardKanaReading
              key={current.renderKey ?? current.key}
              card={current.card}
              disabled={cardPending}
              onRate={actions.rate}
              onCancelableChange={undoDisabled ? undefined : handleCancelableChange}
            />
          )}
        {current.kind === "new_kanji" && (
          <NewKanjiIntroCard
            key={current.key}
            candidate={current.candidate}
            disabled={cardPending}
            onConfirm={() => actions.introduceKanji(current)}
          />
        )}
        {current.kind === "new_vocab" && (
          <NewVocabIntroCard
            key={current.key}
            candidate={current.candidate}
            disabled={cardPending}
            onConfirm={() => actions.introduceVocab(current)}
          />
        )}
        {current.kind === "new_hiragana" && (
          <NewKanaIntroCard
            key={current.key}
            candidate={current.candidate}
            script="hiragana"
            disabled={cardPending}
            onConfirm={() => actions.introduceHiragana(current)}
          />
        )}
        {current.kind === "new_katakana" && (
          <NewKanaIntroCard
            key={current.key}
            candidate={current.candidate}
            script="katakana"
            disabled={cardPending}
            onConfirm={() => actions.introduceKatakana(current)}
          />
        )}
        {current.kind === "new_hiragana_rule" && (
          <NewKanaRuleIntroCard
            key={current.key}
            candidate={current.candidate}
            script="hiragana"
            disabled={cardPending}
            onConfirm={() => actions.introduceHiraganaRule(current)}
          />
        )}
        {current.kind === "new_katakana_rule" && (
          <NewKanaRuleIntroCard
            key={current.key}
            candidate={current.candidate}
            script="katakana"
            disabled={cardPending}
            onConfirm={() => actions.introduceKatakanaRule(current)}
          />
        )}
      </div>
      <div className="flex shrink-0 justify-center px-4 py-2">
        <UndoPill
          visible={!undoDisabled && (lastReview !== null || cancelCheck !== null)}
          disabled={cancelCheck === null && actionPending}
          onUndo={handleUndo}
        />
      </div>
      {levelUpResult && <JlptLevelUpModal result={levelUpResult} onClose={actions.dismissLevelUp} />}
      {kanaGraduationResult && <KanaGraduationModal kind={kanaGraduationResult} onClose={actions.dismissKanaGraduation} />}
    </div>
  );
}
