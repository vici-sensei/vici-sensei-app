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

      <div className={`hero-card${allDone ? " done" : ""}`}>
        <div className="hero-card-text">
          {allDone ? (
            <>
              <h1 className="main-title">You&apos;re all done for today 🎉</h1>
              <p className="subtitle">
                Come back tomorrow for your next reviews, or explore the dictionary in the meantime.
              </p>
            </>
          ) : (
            <>
              <h1 className="main-title">
                You have{" "}
                <span className="highlight" style={{ color: "var(--color-accent-red)" }}>
                  {cardsToday}
                </span>{" "}
                cards to do today
              </h1>
              <p className="subtitle">
                {stats.due_today} reviews are due, plus new kanji and vocabulary ready to introduce.
              </p>
              <StartStudyButton />
            </>
          )}
        </div>
      </div>

      <div className="stat-grid">
        <GlassCard className="stat-card">
          <div className="stat-icon" style={{ background: "rgb(0 210 255 / 0.1)", color: "var(--color-accent-blue)" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </div>
          <div className="stat-num">
            {stats.new_kanji_today}
            <span style={{ color: "var(--color-text-muted)", fontSize: "1.1rem" }}>/{stats.new_kanji_limit}</span>
          </div>
          <div className="stat-label">New kanji today</div>
        </GlassCard>

        <GlassCard className="stat-card">
          <div className="stat-icon" style={{ background: "rgb(0 210 255 / 0.1)", color: "var(--color-accent-blue)" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </svg>
          </div>
          <div className="stat-num">
            {stats.new_vocab_today}
            <span style={{ color: "var(--color-text-muted)", fontSize: "1.1rem" }}>/{stats.new_vocab_limit}</span>
          </div>
          <div className="stat-label">New vocab today</div>
        </GlassCard>

        <GlassCard className="stat-card">
          <div className="stat-icon" style={{ background: "rgb(255 210 0 / 0.12)", color: "var(--color-accent-gold)" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
            </svg>
          </div>
          <div className="stat-num" style={{ color: "var(--color-accent-gold)" }}>
            {stats.streak}
          </div>
          <div className="stat-label">Day streak</div>
        </GlassCard>

        <GlassCard className="stat-card">
          <div className="stat-icon" style={{ background: "rgb(255 74 90 / 0.1)", color: "var(--color-accent-red)" }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <div className="stat-num">{stats.retention_rate != null ? `${Math.round(stats.retention_rate * 100)}%` : "—"}</div>
          <div className="stat-label">Retention (30d)</div>
        </GlassCard>
      </div>

      <Link className="progress-link" href="/progress">
        View detailed progress
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <line x1="5" y1="12" x2="19" y2="12" />
          <polyline points="12 5 19 12 12 19" />
        </svg>
      </Link>
    </div>
  );
}
