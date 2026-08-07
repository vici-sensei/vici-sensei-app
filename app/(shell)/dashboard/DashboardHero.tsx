"use client";

import { GiPartyPopper } from "react-icons/gi";
import { useStudyStats } from "@/lib/study/StudyStatsContext";
import { cardsRemainingToday } from "@/lib/study/stats";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { StartStudyButton } from "./StartStudyButton";
import { NextReviewTime } from "./NextReviewTime";

export function DashboardHero() {
  // Shared with the nav's Study link (see StudyStatsProvider in the shell layout) so both
  // reflect the same live count instead of drifting apart.
  const { stats, studyDisabled: allDone, stale } = useStudyStats();

  if (!stats) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-6 rounded-[20px] border border-border-soft bg-bg-cards p-10 backdrop-blur-[10px]">
        <div className="w-full max-w-md space-y-3">
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="h-5 w-full" />
          <Skeleton className="mt-2.5 h-[52px] w-40 rounded-xl" />
        </div>
      </div>
    );
  }

  const remainingKanji = Math.max(stats.new_kanji_limit - stats.new_kanji_today, 0);
  const remainingVocab = Math.max(stats.new_vocab_limit - stats.new_vocab_today, 0);
  const cardsToday = cardsRemainingToday(stats);
  const dueLaterToday = allDone && stats.next_due_is_today;
  const kanjiPending = remainingKanji > 0;
  const vocabPending = remainingVocab > 0;
  const hasNewContent = kanjiPending || vocabPending;

  let newContentPhrase = "";
  if (kanjiPending && vocabPending) newContentPhrase = "new kanji and vocabulary";
  else if (kanjiPending) newContentPhrase = "new kanji";
  else if (vocabPending) newContentPhrase = "new vocabulary";

  let summaryText: string;
  if (stats.due_today > 0 && hasNewContent) {
    summaryText = `${stats.due_today} review${stats.due_today === 1 ? "" : "s"} due, plus ${newContentPhrase} ready to introduce.`;
  } else if (stats.due_today > 0) {
    summaryText = `${stats.due_today} review${stats.due_today === 1 ? "" : "s"} due today.`;
  } else {
    const verb = kanjiPending && vocabPending ? "are" : "is";
    summaryText = `${newContentPhrase.charAt(0).toUpperCase() + newContentPhrase.slice(1)} ${verb} ready to introduce.`;
  }

  return (
    <div
      className={`relative flex flex-wrap items-center justify-between gap-6 overflow-hidden rounded-[20px] border border-border-soft bg-bg-cards p-10 backdrop-blur-[10px] before:pointer-events-none before:absolute before:inset-0 ${
        allDone
          ? "before:bg-[radial-gradient(circle_at_15%_20%,rgb(255_210_0/0.1)_0%,transparent_55%)]"
          : "before:bg-[radial-gradient(circle_at_15%_20%,rgb(255_74_90/0.12)_0%,transparent_55%)]"
      }`}
    >
      <div className="relative text-center sm:text-left">
        {allDone ? (
          <>
            <h1 className="mb-2 flex items-center justify-center gap-3 text-[2.1rem] font-extrabold leading-[1.2] tracking-[-0.8px] sm:justify-start">
              You&apos;re all done for {dueLaterToday ? "now" : "today"}
              <GiPartyPopper className="h-14 w-14 text-accent-gold" />
            </h1>
            <p className="text-base leading-[1.6] text-text-muted">
              {dueLaterToday && stats.next_due_at ? (
                <>
                  Your next review is at <NextReviewTime dueAt={stats.next_due_at} />. Explore the dictionary in the
                  meantime.
                </>
              ) : (
                "Come back tomorrow for your next reviews, or explore the dictionary in the meantime."
              )}
            </p>
          </>
        ) : (
          <>
            <h1 className="mb-2 text-[2.1rem] font-extrabold leading-[1.2] tracking-[-0.8px]">
              You have{" "}
              <span className="font-extrabold text-accent-red">{cardsToday}</span>{" "}
              card{cardsToday === 1 ? "" : "s"} to do today
            </h1>
            <p className="text-base leading-[1.6] text-text-muted">{summaryText}</p>
          </>
        )}
        <StartStudyButton disabled={allDone} />
        {stale && (
          <p className="mt-2.5 text-sm text-text-muted">Couldn&apos;t refresh your stats — try reloading the page.</p>
        )}
      </div>
    </div>
  );
}
