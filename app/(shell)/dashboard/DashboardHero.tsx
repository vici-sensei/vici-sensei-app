"use client";

import { useEffect, useState } from "react";
import { GiPartyPopper } from "react-icons/gi";
import { apiGet } from "@/lib/api/client";
import type { StudyStats } from "@/lib/types";
import { cardsRemainingToday } from "@/lib/study/stats";
import { StartStudyButton } from "./StartStudyButton";
import { NextReviewTime } from "./NextReviewTime";

const POLL_INTERVAL_MS = 30_000;

export function DashboardHero({ initialStats }: { initialStats: StudyStats }) {
  const [stats, setStats] = useState(initialStats);

  useEffect(() => {
    let cancelled = false;

    async function refresh() {
      try {
        const fresh = await apiGet<StudyStats>("/api/study/stats");
        if (!cancelled) setStats(fresh);
      } catch {
        // Keep showing the last known stats; the next tick or focus event will retry.
      }
    }

    // Polling re-asks the server (whose clock is authoritative) rather than
    // trusting the device clock to know when a review becomes due or a new
    // day starts.
    const interval = setInterval(refresh, POLL_INTERVAL_MS);
    function onVisibilityChange() {
      if (document.visibilityState === "visible") void refresh();
    }
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      cancelled = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  const remainingKanji = Math.max(stats.new_kanji_limit - stats.new_kanji_today, 0);
  const remainingVocab = Math.max(stats.new_vocab_limit - stats.new_vocab_today, 0);
  const cardsToday = cardsRemainingToday(stats);
  const allDone = cardsToday === 0;
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
      <div className="relative">
        {allDone ? (
          <>
            <h1 className="mb-2 flex items-center gap-3 text-[2.1rem] font-extrabold leading-[1.2] tracking-[-0.8px]">
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
      </div>
    </div>
  );
}
