"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { popStoredSummary } from "@/lib/study/session";
import type { StudySessionEnd } from "@/lib/types";
import { Badge } from "@/app/components/ui/Badge";

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
    <div className="summary-screen">
      <div className="summary-card">
        <Badge color="gold">Session complete</Badge>
        <h1 className="main-title" style={{ marginTop: 18 }}>
          Nice work! You&apos;re done for today.
        </h1>
        <p className="subtitle">Here&apos;s how today&apos;s session went.</p>
        <div className="summary-stats">
          <div className="summary-stat">
            <div className="num">{summary.cards_reviewed}</div>
            <div className="lbl">Reviewed</div>
          </div>
          <div className="summary-stat">
            <div className="num" style={{ color: "var(--color-accent-blue)" }}>
              {accuracyLabel}
            </div>
            <div className="lbl">Accuracy</div>
          </div>
          <div className="summary-stat">
            <div className="num">{formatDuration(summary.duration_seconds)}</div>
            <div className="lbl">Duration</div>
          </div>
        </div>
        <Link href="/dashboard" className="btn-primary">
          Back to Home
        </Link>
      </div>
    </div>
  );
}
