import Link from "next/link";
import { fetchServer } from "@/lib/api/server";
import type { StudyStats } from "@/lib/types";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { StartStudyButton } from "./StartStudyButton";
import { CheckoutBanner } from "./CheckoutBanner";
import { FaBook, FaPenToSquare, FaFire, FaClock, FaArrowRight } from "react-icons/fa6";

interface DashboardPageProps {
  searchParams: Promise<{ checkout?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { checkout } = await searchParams;
  const stats = await fetchServer<StudyStats>("/api/study/stats");

  const remainingKanji = Math.max(stats.new_kanji_limit - stats.new_kanji_today, 0);
  const remainingVocab = Math.max(stats.new_vocab_limit - stats.new_vocab_today, 0);
  const cardsToday = stats.due_today + remainingKanji + remainingVocab;
  const allDone = cardsToday === 0;
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
    <div>
      {(checkout === "success" || checkout === "cancel") && <CheckoutBanner status={checkout} />}

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
              <h1 className="mb-2 text-[2.1rem] font-extrabold leading-[1.2] tracking-[-0.8px]">You&apos;re all done for today 🎉</h1>
              <p className="text-base leading-[1.6] text-text-muted">
                Come back tomorrow for your next reviews, or explore the dictionary in the meantime.
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
              <StartStudyButton />
            </>
          )}
        </div>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-[18px] md:grid-cols-4">
        <GlassCard padding="sm">
          <div className="mb-3.5 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-blue/10 text-accent-blue">
            <FaBook className="h-4 w-4" />
          </div>
          <div className="mb-1.5 text-3xl font-extrabold leading-none tracking-tight">
            {stats.new_kanji_today}
            <span className="text-[1.1rem] text-text-muted">/{stats.new_kanji_limit}</span>
          </div>
          <div className="text-sm font-semibold text-text-muted">New kanji today</div>
        </GlassCard>

        <GlassCard padding="sm">
          <div className="mb-3.5 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-blue/10 text-accent-blue">
            <FaPenToSquare className="h-4 w-4" />
          </div>
          <div className="mb-1.5 text-3xl font-extrabold leading-none tracking-tight">
            {stats.new_vocab_today}
            <span className="text-[1.1rem] text-text-muted">/{stats.new_vocab_limit}</span>
          </div>
          <div className="text-sm font-semibold text-text-muted">New vocab today</div>
        </GlassCard>

        <GlassCard padding="sm">
          <div className="mb-3.5 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-gold/[0.12] text-accent-gold">
            <FaFire className="h-4 w-4" />
          </div>
          <div className="mb-1.5 text-3xl font-extrabold leading-none tracking-tight text-accent-gold">{stats.streak}</div>
          <div className="text-sm font-semibold text-text-muted">Day streak</div>
        </GlassCard>

        <GlassCard padding="sm">
          <div className="mb-3.5 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-red/10 text-accent-red">
            <FaClock className="h-4 w-4" />
          </div>
          <div
            className={
              stats.retention_rate != null
                ? "mb-1.5 text-3xl font-extrabold leading-none tracking-tight"
                : "mb-1.5 text-3xl font-semibold leading-none tracking-tight text-text-muted"
            }
          >
            {stats.retention_rate != null ? `${Math.round(stats.retention_rate * 100)}%` : "N/A"}
          </div>
          <div className="text-sm font-semibold text-text-muted">Retention (30d)</div>
        </GlassCard>
      </div>

      <Link
        className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-text-muted transition-[color,gap] duration-200 hover:gap-2.5 hover:text-white"
        href="/progress"
      >
        View detailed progress
        <FaArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
