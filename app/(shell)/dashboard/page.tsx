import Link from "next/link";
import { fetchServer } from "@/lib/api/server";
import type { StudyStats } from "@/lib/types";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { StartStudyButton } from "./StartStudyButton";
import { CheckoutBanner } from "./CheckoutBanner";

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
                cards to do today
              </h1>
              <p className="text-base leading-[1.6] text-text-muted">
                {stats.due_today} reviews are due, plus new kanji and vocabulary ready to introduce.
              </p>
              <StartStudyButton />
            </>
          )}
        </div>
      </div>

      <div className="mt-7 grid grid-cols-2 gap-[18px] md:grid-cols-4">
        <GlassCard padding="sm">
          <div className="mb-3.5 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-blue/10 text-accent-blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </div>
          <div className="mb-1.5 text-3xl font-extrabold leading-none tracking-tight">
            {stats.new_kanji_today}
            <span className="text-[1.1rem] text-text-muted">/{stats.new_kanji_limit}</span>
          </div>
          <div className="text-sm font-semibold text-text-muted">New kanji today</div>
        </GlassCard>

        <GlassCard padding="sm">
          <div className="mb-3.5 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-blue/10 text-accent-blue">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </div>
          <div className="mb-1.5 text-3xl font-extrabold leading-none tracking-tight">
            {stats.new_vocab_today}
            <span className="text-[1.1rem] text-text-muted">/{stats.new_vocab_limit}</span>
          </div>
          <div className="text-sm font-semibold text-text-muted">New vocab today</div>
        </GlassCard>

        <GlassCard padding="sm">
          <div className="mb-3.5 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-gold/[0.12] text-accent-gold">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
            </svg>
          </div>
          <div className="mb-1.5 text-3xl font-extrabold leading-none tracking-tight text-accent-gold">{stats.streak}</div>
          <div className="text-sm font-semibold text-text-muted">Day streak</div>
        </GlassCard>

        <GlassCard padding="sm">
          <div className="mb-3.5 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-red/10 text-accent-red">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div className="mb-1.5 text-3xl font-extrabold leading-none tracking-tight">
            {stats.retention_rate != null ? `${Math.round(stats.retention_rate * 100)}%` : "—"}
          </div>
          <div className="text-sm font-semibold text-text-muted">Retention (30d)</div>
        </GlassCard>
      </div>

      <Link
        className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-text-muted transition-[color,gap] duration-200 hover:gap-2.5 hover:text-white"
        href="/progress"
      >
        View detailed progress
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" className="h-4 w-4">
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </Link>
    </div>
  );
}
