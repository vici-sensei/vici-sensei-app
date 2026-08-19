"use client";

import { GiPartyPopper } from "react-icons/gi";
import { useStudyStats } from "@/lib/study/StudyStatsContext";
import { cardsRemainingToday } from "@/lib/study/stats";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { StartStudyButton } from "./StartStudyButton";
import { NextCardCountdown } from "./NextCardCountdown";

export function DashboardHero() {
  // Shared with the nav's Study link (see StudyStatsProvider in the shell layout) so both
  // reflect the same live count instead of drifting apart.
  const { stats, studyDisabled: allDone, stale } = useStudyStats();

  if (!stats) {
    return (
      <GlassCard padding="sm" className={`flex flex-wrap items-center justify-between gap-6 p-5`}>
        <div className="w-full max-w-md space-y-3">
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="mt-2.5 h-[52px] w-40 rounded-xl" />
        </div>
      </GlassCard>
    );
  }

  const remainingKanji = Math.max(stats.new_kanji_limit - stats.new_kanji_today, 0);
  const remainingVocab = Math.max(stats.new_vocab_limit - stats.new_vocab_today, 0);
  const cardsToday = cardsRemainingToday(stats);
  const dueLaterToday = allDone && stats.next_due_is_today;

  // Phase, not card category, is what changes how a review behaves: learning/relearning cards
  // resurface later in the same session (LEARNING_STEPS_MINUTES), review cards won't come back
  // until a future day.
  const reviewParts: string[] = [];
  if (stats.due_learning > 0) reviewParts.push(`${stats.due_learning} in learning`);
  if (stats.due_review > 0) reviewParts.push(`${stats.due_review} up for review`);

  const newParts: string[] = [];
  if (remainingKanji > 0) newParts.push(`${remainingKanji} new kanji`);
  if (remainingVocab > 0)
    newParts.push(`${remainingVocab} new vocabulary word${remainingVocab === 1 ? "" : "s"}`);

  const sentenceParts: string[] = [];
  if (reviewParts.length > 0) sentenceParts.push(reviewParts.join(" and "));
  if (newParts.length > 0) sentenceParts.push(`${newParts.join(" and ")} ready to learn`);

  const summaryText = `${sentenceParts.join(", plus ")}.`;

  return (
    <GlassCard
      padding="sm"
      className={`flex flex-wrap items-center justify-between gap-6 overflow-hidden before:pointer-events-none before:absolute before:inset-0 p-5 ${
        allDone
          ? "before:bg-[radial-gradient(circle_at_15%_20%,rgb(255_210_0/0.1)_0%,transparent_55%)]"
          : "before:bg-[radial-gradient(circle_at_15%_20%,rgb(255_74_90/0.12)_0%,transparent_55%)]"
      }`}
    >
      {allDone && (
        <GiPartyPopper className="pointer-events-none absolute -bottom-4 -right-4 h-32 w-32 text-accent-gold/10 md:h-40 md:w-40" />
      )}
      <div className="relative text-center sm:text-left">
        {allDone ? (
          <>
            <h1 className="mb-2 text-2xl md:text-3xl font-extrabold leading-[1.2] tracking-[-0.8px]">
              You&apos;re all done for {dueLaterToday ? "now" : "today"}
            </h1>
            <p className="text-base leading-[1.6] text-text-muted">
              {dueLaterToday && stats.next_due_at ? (
                <>
                  Your next card is ready in <NextCardCountdown dueAt={stats.next_due_at} />. Explore the dictionary
                  in the meantime.
                </>
              ) : (
                "Come back tomorrow for your next reviews, or explore the dictionary in the meantime."
              )}
            </p>
          </>
        ) : (
          <>
            <h1 className="mb-2 flex-wrap items-center justify-center gap-3 text-2xl md:text-3xl font-extrabold leading-[1.2] tracking-[-0.8px] md:justify-start">
              You have{" "}
              <span className="font-extrabold text-accent-red">{cardsToday}</span>{" "}
              card{cardsToday === 1 ? "" : "s"} to do today
            </h1>
            <p className="text-base leading-[1.6] text-text-muted">{summaryText}</p>
          </>
        )}
        {stale && (
          <p className="mt-2.5 text-sm text-text-muted">Couldn&apos;t refresh your stats — try reloading the page.</p>
        )}
      </div>
      <StartStudyButton disabled={allDone} />
    </GlassCard>
  );
}
