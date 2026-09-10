"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { endSession } from "@/lib/client-data/study";
import { clearStoredSessionId, getStoredSessionId } from "@/lib/study/session";
import { createClient } from "@/lib/supabase/client";
import { acknowledgeAchievements, fetchUnacknowledgedAchievements } from "@/lib/data/achievements";
import { fetchHiraganaMastered, fetchKatakanaMastered, refreshStudySettings } from "@/lib/client-data/studySettings";
import { clearKanaGraduationWatch, isKanaGraduationWatched } from "@/lib/study/kanaGraduationWatch";
import { useStudyOnboarding } from "@/lib/study/StudyOnboardingContext";
import { useServerClockOffset } from "@/lib/client-data/serverClockOffset";
import { celebrate } from "@/lib/confetti";
import type { KanaGraduationKind, StudySessionEnd } from "@/lib/types";
import { ACHIEVEMENT_CATALOG, type AchievementCatalogEntry } from "@/lib/achievements/registry";
import { Badge } from "@/app/components/ui/Badge";
import { Button } from "@/app/components/ui/Button";
import { NextCardEta } from "@/app/(shell)/dashboard/NextCardEta";
import { NewAchievementsModal } from "@/app/components/study/NewAchievementsModal";
import { KanaGraduationModal } from "@/app/components/study/KanaGraduationModal";

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m === 0 ? `${s}s` : `${m}m ${s}s`;
}

function StatBox({ children }: { children: ReactNode }) {
  return <div className="rounded-2xl border border-border-soft bg-bg-cards px-3 py-[22px] backdrop-blur-[10px]">{children}</div>;
}

function Stat({
  value,
  valueClassName = "mb-1 text-[1.7rem] font-extrabold",
  label,
}: {
  value: ReactNode;
  valueClassName?: string;
  label: string;
}) {
  return (
    <StatBox>
      <div className={valueClassName}>{value}</div>
      <div className="text-[0.78rem] font-semibold text-text-muted">{label}</div>
    </StatBox>
  );
}

export default function StudySummaryPage() {
  const router = useRouter();
  const { user } = useStudyOnboarding();
  const [summary, setSummary] = useState<StudySessionEnd | null>(null);
  const [newAchievements, setNewAchievements] = useState<AchievementCatalogEntry[]>([]);
  const [kanaGraduationResult, setKanaGraduationResult] = useState<KanaGraduationKind | null>(null);
  const hasStarted = useRef(false);
  // No StudyStatsProvider on this route (only (shell) layouts have one) -- fetched directly,
  // same as the leaderboard page does.
  const clockOffsetMs = useServerClockOffset();

  useEffect(() => {
    // Strict Mode double-invokes effects on mount in dev. The session id is
    // cleared as soon as the end call succeeds, so a second invocation would
    // find nothing and redirect away — this guard makes the call happen
    // exactly once regardless of how many times the effect runs.
    if (hasStarted.current) return;
    hasStarted.current = true;

    fetchUnacknowledgedAchievements(createClient(), user.id)
      .then((keys) => {
        if (keys.length === 0) return;
        const entries = ACHIEVEMENT_CATALOG.filter((entry) => keys.includes(entry.achievementKey));
        setNewAchievements(entries);
      })
      .catch(() => {
        // Non-critical -- worst case the celebration is missed this visit; the achievement stays
        // unacknowledged and will still surface next time.
      });

    // Fallback for useStudyQueue's "just mastered hiragana/katakana" (or "finished all of kana")
    // celebration -- see kanaGraduationWatch.ts. If the qualifying review was the LAST card of the
    // session, the session ends (and navigates here) before that hook's async mastery check
    // resolves, and /study's own skeleton gate means the modal couldn't have rendered there even
    // if it had resolved in time. Each kind left "watched" (this session started short of its
    // milestone) gets one authoritative re-check here instead.
    if (isKanaGraduationWatched(user.id, "hiragana_complete")) {
      fetchHiraganaMastered(user.id)
        .then((mastered) => {
          clearKanaGraduationWatch(user.id, "hiragana_complete");
          if (mastered) setKanaGraduationResult("hiragana_complete");
        })
        .catch(() => {
          // Non-critical -- worst case the celebration is missed this visit; the dashboard's own
          // "Take the reading test" CTA still surfaces the same next step.
        });
    }
    if (isKanaGraduationWatched(user.id, "katakana_mastered")) {
      fetchKatakanaMastered(user.id)
        .then((mastered) => {
          clearKanaGraduationWatch(user.id, "katakana_mastered");
          if (mastered) setKanaGraduationResult("katakana_mastered");
        })
        .catch(() => {
          // Non-critical -- same reasoning as above.
        });
    }
    if (isKanaGraduationWatched(user.id, "katakana_complete")) {
      refreshStudySettings(user.id)
        .then((fresh) => {
          clearKanaGraduationWatch(user.id, "katakana_complete");
          if (fresh.study_track === "standard") setKanaGraduationResult("katakana_complete");
        })
        .catch(() => {
          // Non-critical -- same reasoning as above.
        });
    }

    const sessionId = getStoredSessionId(user.id);
    if (sessionId == null) {
      router.replace("/dashboard");
      return;
    }

    (async () => {
      try {
        const result = await endSession(sessionId);
        clearStoredSessionId(user.id);
        setSummary(result);
        void celebrate();
      } catch (err) {
        if (!(err instanceof ApiError)) throw err;
        router.replace("/dashboard");
      }
    })();
  }, [router, user.id]);

  // Rendered immediately with placeholder values instead of a skeleton -- see summary-null
  // fallbacks below -- and only the "next review" line waits on real data, since until
  // next_due_is_today comes back we don't know whether it or the "session went" line applies.
  const accuracyLabel = summary && summary.accuracy != null ? `${Math.round(summary.accuracy * 100)}%` : "N/A";

  const dueLaterToday = summary ? summary.next_due_is_today : true;

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-[60px] before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_50%_15%,rgb(255_210_0/0.08)_0%,transparent_55%)]">
      <div className="relative w-full max-w-[560px] text-center">
        <Badge color="gold">Session complete</Badge>
        <h1 className="mb-2 mt-4.5 text-[2.1rem] font-extrabold leading-[1.2] tracking-[-0.8px]">
          Nice work! You&apos;re done for {dueLaterToday ? "now" : "today"}.
        </h1>
        <p className="text-base leading-[1.6] text-text-muted">
          {summary &&
            (dueLaterToday && summary.next_due_at ? (
              <>
                Your next review is <NextCardEta dueAt={summary.next_due_at} clockOffsetMs={clockOffsetMs} />
              </>
            ) : (
              "Here's how today's session went."
            ))}
        </p>
        <div className="my-8.5 grid grid-cols-2 gap-3.5 sm:grid-cols-4">
          <Stat value={summary ? summary.cards_reviewed : "-"} label="Reviewed" />
          <Stat value={summary ? summary.new_cards_learned : "-"} label="New" />
          <Stat
            value={accuracyLabel}
            valueClassName={
              summary && summary.accuracy != null
                ? "mb-1 text-[1.7rem] font-extrabold text-accent-gold"
                : "mb-1 text-[1.7rem] font-semibold text-text-muted"
            }
            label="Accuracy"
          />
          <Stat value={summary ? formatDuration(summary.duration_seconds) : "-"} label="Duration" />
        </div>
        <Button disabled={!summary} onClick={() => router.push("/dashboard")}>
          Back to Home
        </Button>
      </div>
      {newAchievements.length > 0 && (
        <NewAchievementsModal
          entries={newAchievements}
          onClose={() => {
            const keys = newAchievements.map((entry) => entry.achievementKey);
            setNewAchievements([]);
            void acknowledgeAchievements(createClient(), keys).catch(() => {
              // Non-critical -- worst case the same achievement is shown again next session.
            });
          }}
        />
      )}
      {kanaGraduationResult && (
        <KanaGraduationModal kind={kanaGraduationResult} onClose={() => setKanaGraduationResult(null)} />
      )}
    </div>
  );
}
