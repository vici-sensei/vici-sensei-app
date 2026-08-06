"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useVocabularyDetail } from "@/lib/client-data/vocabulary";
import { useVocabularyProgress } from "@/lib/client-data/progress";
import { StatusPill } from "@/app/components/ui/StatusPill";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { CardActions } from "@/app/components/browse/CardActions";
import { formatDueAt } from "@/lib/format";
import { buttonClasses } from "@/app/components/ui/Button";

function NotFound() {
  return (
    <div className="px-5 py-15 text-center text-text-muted">
      <h3 className="mb-2 text-[1.15rem] text-white">Word not found</h3>
      <p>This vocabulary entry doesn&apos;t exist or may have been removed.</p>
      <Link href="/browse/vocabulary" className={buttonClasses({ variant: "secondary", size: "sm", hover: "hover", className: "mt-4" })}>
        ← Back to results
      </Link>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div>
      <Skeleton className="mb-6 h-9 w-32 rounded-xl" />
      <Skeleton className="h-24 w-full rounded-2xl" />
    </div>
  );
}

function VocabularyDetailContent({ wordId }: { wordId: number }) {
  const { user } = useAuth();
  const { data: word, status: wordStatus } = useVocabularyDetail(wordId);
  const { data: progress, status: progressStatus, refetch: refetchProgress } = useVocabularyProgress(user, wordId);

  if (wordStatus === "loading" || progressStatus === "loading") return <DetailSkeleton />;
  if (!word) return <NotFound />;

  const factLabel = "mb-1 text-[0.72rem] font-extrabold uppercase tracking-[1px] text-text-muted";

  return (
    <div>
      <Link href="/browse/vocabulary" className={buttonClasses({ variant: "secondary", size: "sm", hover: "hover", className: "mb-6" })}>
        ← Back to results
      </Link>

      <div className="mb-7.5 flex flex-wrap items-center gap-7.5">
        <div className="min-w-55 flex-1">
          <div className="mt-1 text-[1.2rem] font-bold text-accent-blue">{word.kana_reading}</div>
          <div className="text-[clamp(2.2rem,5vw,3rem)] font-extrabold leading-[1.1] mb-3">{word.word}</div>
          <div className="mb-3 text-[1.35rem] font-bold">{word.meanings?.join(", ")}</div>
          <div className="flex flex-wrap gap-6">
            <div>
              <div className={factLabel}>Part of speech</div>
              <div className="text-base font-bold">{word.parts_of_speech?.join(", ") || "—"}</div>
            </div>
            <div>
              <div className={factLabel}>JLPT level</div>
              <div className="text-base font-bold">
                <LevelBadge level={word.jlpt_level} />
              </div>
            </div>
            <div>
              <div className={factLabel}>Other readings</div>
              <div className="text-base font-bold text-text-muted">{word.other_readings?.join(", ") || "—"}</div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 mb-3.5 text-[0.8rem] font-extrabold uppercase tracking-[1.2px] text-text-muted">Your progress</div>
      {progress ? (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border-soft bg-white/[0.02] px-4.5 py-3.5">
          <div className="text-[0.92rem] font-bold">Meaning — &quot;{word.meanings?.[0] ?? word.word}&quot;</div>
          <div className="flex flex-wrap items-center gap-3.5">
            <StatusPill status={progress.status} />
            <span className="text-[0.8rem] tabular-nums text-text-muted">due {formatDueAt(progress.due_at)}</span>
            <CardActions type="vocab" id={word.id} status={progress.status} onSuccess={refetchProgress} />
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border-soft bg-white/[0.02] px-5 py-4.5 text-[0.92rem] text-text-muted">
          You haven&apos;t started this word yet. It&apos;ll appear here once it comes up in your normal study queue.
        </div>
      )}
    </div>
  );
}

function VocabularyDetailFromQuery() {
  const searchParams = useSearchParams();
  const wordId = Number(searchParams.get("id"));
  if (!searchParams.get("id") || Number.isNaN(wordId)) return <NotFound />;
  return <VocabularyDetailContent wordId={wordId} />;
}

export default function VocabularyDetailPage() {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <VocabularyDetailFromQuery />
    </Suspense>
  );
}
