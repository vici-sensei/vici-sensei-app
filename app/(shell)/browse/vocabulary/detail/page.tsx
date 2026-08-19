"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useVocabularyDetail } from "@/lib/client-data/vocabulary";
import { useVocabularyProgress } from "@/lib/client-data/progress";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { ProgressCardRow, EmptyProgressNotice } from "@/app/components/browse/ProgressCardRow";
import { BrowseBackLink, BrowseNotFound } from "@/app/components/browse/BrowseDetailNav";
import { renderWordWithFurigana } from "@/lib/study/furigana";

function NotFound() {
  return (
    <BrowseNotFound
      title="Word not found"
      message="This vocabulary entry doesn't exist or may have been removed."
      backHref="/browse/vocabulary"
    />
  );
}

function DetailSkeleton() {
  return (
    <div>
      <Skeleton className="mb-6 h-9 w-32 rounded-xl" />

      <div className="mb-7.5 flex flex-wrap items-center gap-7.5">
        <div className="min-w-55 flex-1">
          <Skeleton className="mt-1 mb-3 h-5 w-24" />
          <Skeleton className="mb-3 h-11 w-52" />
          <Skeleton className="mb-3 h-6 w-40" />
          <div className="flex flex-wrap gap-6">
            {["w-16", "w-12", "w-20"].map((w) => (
              <div key={w}>
                <Skeleton className="mb-1.5 h-3 w-16" />
                <Skeleton className={`h-5 ${w}`} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <Skeleton className="mt-8 mb-3.5 h-3.5 w-28" />
      <Skeleton className="h-15 w-full rounded-xl" />
    </div>
  );
}

function VocabularyDetailContent({ wordId }: { wordId: number }) {
  const { user } = useAuth();
  const { data: word, status: wordStatus } = useVocabularyDetail(wordId);
  const {
    data: progress,
    status: progressStatus,
    refetch: refetchProgress,
    mutate: mutateProgress,
  } = useVocabularyProgress(user, wordId);

  if (wordStatus === "loading" || progressStatus === "loading") return <DetailSkeleton />;
  if (!word) return <NotFound />;

  const factLabel = "mb-1 text-[0.72rem] font-extrabold uppercase tracking-[1px] text-text-muted";

  return (
    <div>
      <BrowseBackLink href="/browse/vocabulary" />

      <div className="mb-7.5 flex flex-wrap items-center gap-7.5">
        <div className="min-w-55 flex-1">
          <div className="pt-[0.6em] text-5xl leading-[1.1] mb-3">
            {renderWordWithFurigana(word.word, word.furiganas, "text-lg text-accent-blue", "bg-accent-blue/10", true)}
          </div>
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
        <ProgressCardRow
          title={<>Meaning — &quot;{word.meanings?.[0] ?? word.word}&quot;</>}
          status={progress.status}
          dueAt={progress.due_at}
          cardType="vocab"
          cardId={word.id}
          onOptimisticUpdate={(action) =>
            mutateProgress((prev) => (action === "reset" ? null : prev ? { ...prev, status: "suspended" } : prev))
          }
          onSuccess={refetchProgress}
          onError={refetchProgress}
        />
      ) : (
        <EmptyProgressNotice>
          You haven&apos;t started this word yet. It&apos;ll appear here once it comes up in your normal study queue.
        </EmptyProgressNotice>
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
