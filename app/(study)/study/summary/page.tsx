"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { popStoredSummary } from "@/lib/study/session";
import type { StudySessionEnd } from "@/lib/types";
import { Badge } from "@/app/components/ui/Badge";
import { buttonClasses } from "@/app/components/ui/Button";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m === 0 ? `${s}s` : `${m}m ${s}s`;
}

export default function StudySummaryPage() {
  const router = useRouter();
  const [summary, setSummary] = useState<StudySessionEnd | null>(null);

  useEffect(() => {
    const stored = popStoredSummary();
    if (!stored) {
      router.replace("/dashboard");
      return;
    }
    setSummary(stored);
  }, [router]);

  if (!summary) return null;

  const accuracyLabel = summary.accuracy != null ? `${Math.round(summary.accuracy * 100)}%` : "—";

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-[60px] before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_50%_15%,rgb(255_210_0/0.08)_0%,transparent_55%)]">
      <div className="relative w-full max-w-[560px] text-center">
        <Badge color="gold">Session complete</Badge>
        <h1 className="main-title mt-4.5">Nice work! You&apos;re done for today.</h1>
        <p className="subtitle">Here&apos;s how today&apos;s session went.</p>
        <div className="my-8.5 grid grid-cols-3 gap-3.5">
          <div className="rounded-2xl border border-border-soft bg-bg-cards px-3 py-[22px] backdrop-blur-[10px]">
            <div className="mb-1 text-[1.7rem] font-extrabold">{summary.cards_reviewed}</div>
            <div className="text-[0.78rem] font-semibold text-text-muted">Reviewed</div>
          </div>
          <div className="rounded-2xl border border-border-soft bg-bg-cards px-3 py-[22px] backdrop-blur-[10px]">
            <div className="mb-1 text-[1.7rem] font-extrabold text-accent-blue">{accuracyLabel}</div>
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
