"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import confetti from "canvas-confetti";
import { popStoredSummary } from "@/lib/study/session";
import type { StudySessionEnd } from "@/lib/types";
import { Badge } from "@/app/components/ui/Badge";
import { buttonClasses } from "@/app/components/ui/Button";
import { NextReviewTime } from "@/app/(shell)/dashboard/NextReviewTime";

const CONFETTI_COLORS = ["#ffd200", "#ff4a5a", "#00d2ff"];

function celebrate() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  confetti({
    particleCount: 120,
    spread: 80,
    startVelocity: 45,
    origin: { y: 0.6 },
    colors: CONFETTI_COLORS,
  });
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m === 0 ? `${s}s` : `${m}m ${s}s`;
}

export default function StudySummaryPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<StudySessionEnd | null>(null);
  const hasPopped = useRef(false);

  useEffect(() => {
    // Strict Mode double-invokes effects on mount in dev. popStoredSummary()
    // clears sessionStorage as it reads, so a second invocation would find
    // nothing and immediately redirect away — this guard makes the pop
    // happen exactly once regardless of how many times the effect runs.
    if (hasPopped.current) return;
    hasPopped.current = true;

    const stored = popStoredSummary();
    if (!stored) {
      router.replace("/dashboard");
      return;
    }
    // sessionStorage is only readable client-side, so this can't be the initial state —
    // it must be set post-mount. Reading it any earlier (a lazy useState initializer, a
    // ref checked during render) makes the client's first paint diverge from the null
    // server render and trips a hydration mismatch instead.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSummary(stored);
    celebrate();
  }, [router]);

  if (!summary) return null;

  const accuracyLabel = summary.accuracy != null ? `${Math.round(summary.accuracy * 100)}%` : "N/A";

  const dueLaterToday = summary.next_due_is_today;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-[60px] before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_50%_15%,rgb(255_210_0/0.08)_0%,transparent_55%)]">
      <div className="relative w-full max-w-[560px] text-center">
        <Badge color="gold">Session complete</Badge>
        <h1 className="mb-2 mt-4.5 text-[2.1rem] font-extrabold leading-[1.2] tracking-[-0.8px]">
          Nice work! You&apos;re done for {dueLaterToday ? "now" : "today"}.
        </h1>
        <p className="text-base leading-[1.6] text-text-muted">
          {dueLaterToday && summary.next_due_at ? (
            <>
              Your next review is at <NextReviewTime dueAt={summary.next_due_at} />.
            </>
          ) : (
            "Here's how today's session went."
          )}
        </p>
        <div className="my-8.5 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
          <div className="rounded-2xl border border-border-soft bg-bg-cards px-3 py-[22px] backdrop-blur-[10px]">
            <div className="mb-1 text-[1.7rem] font-extrabold">{summary.cards_reviewed}</div>
            <div className="text-[0.78rem] font-semibold text-text-muted">Reviewed</div>
          </div>
          <div className="rounded-2xl border border-border-soft bg-bg-cards px-3 py-[22px] backdrop-blur-[10px]">
            <div className="mb-1 text-[1.7rem] font-extrabold">{summary.new_cards_learned}</div>
            <div className="text-[0.78rem] font-semibold text-text-muted">New</div>
          </div>
          <div className="rounded-2xl border border-border-soft bg-bg-cards px-3 py-[22px] backdrop-blur-[10px]">
            <div
              className={
                summary.accuracy != null
                  ? "mb-1 text-[1.7rem] font-extrabold text-accent-blue"
                  : "mb-1 text-[1.7rem] font-semibold text-text-muted"
              }
            >
              {accuracyLabel}
            </div>
            <div className="text-[0.78rem] font-semibold text-text-muted">Accuracy</div>
          </div>
          <div className="rounded-2xl border border-border-soft bg-bg-cards px-3 py-[22px] backdrop-blur-[10px]">
            <div className="mb-1 text-[1.7rem] font-extrabold">{formatDuration(summary.duration_seconds)}</div>
            <div className="text-[0.78rem] font-semibold text-text-muted">Duration</div>
          </div>
        </div>
        <Link href="/dashboard" className={buttonClasses({ hover: "hover" })}>
          Back to Home
        </Link>
      </div>
    </div>
  );
}
