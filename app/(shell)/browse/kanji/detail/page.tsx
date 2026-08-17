"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useKanjiDetail } from "@/lib/client-data/kanji";
import { useKanjiProgress } from "@/lib/client-data/progress";
import { StatusPill } from "@/app/components/ui/StatusPill";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { CardActions } from "@/app/components/browse/CardActions";
import { formatDueAt } from "@/lib/format";
import { buttonClasses } from "@/app/components/ui/Button";
import { renderWordWithFurigana } from "@/lib/study/furigana";

function NotFound() {
  return (
    <div className="px-5 py-15 text-center text-text-muted">
      <h3 className="mb-2 text-[1.15rem] text-white">Kanji not found</h3>
      <p>This kanji doesn&apos;t exist or may have been removed.</p>
      <Link href="/browse/kanji" prefetch={false} className={buttonClasses({ variant: "secondary", size: "sm", hover: "hover", className: "mt-4" })}>
        ← Back to results
      </Link>
    </div>
  );
}

function DetailSkeleton() {
  return (
    <div>
      <Skeleton className="mb-6 h-9 w-32 rounded-xl" />

      <div className="mb-7.5 flex flex-wrap items-center gap-7.5">
        <Skeleton className="h-24 w-24 shrink-0 rounded-2xl" />
        <div className="min-w-55 flex-1">
          <Skeleton className="mb-3 h-6 w-40" />
          <div className="flex flex-wrap gap-6">
            {["kun", "on", "level"].map((key, i) => (
              <div key={key}>
                <Skeleton className="mb-1.5 h-3 w-16" />
                <Skeleton className={`h-5 ${i === 2 ? "w-12" : "w-14"}`} />
              </div>
            ))}
          </div>
        </div>
      </div>

      <Skeleton className="mt-8 mb-3.5 h-3.5 w-32" />
      <div className="grid grid-cols-1 gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div className="rounded-xl border border-border-soft bg-white/[0.03] px-3.5 py-4" key={i}>
            <Skeleton className="mb-2 h-3.5 w-12" />
            <Skeleton className="mb-1.5 h-7 w-16" />
            <Skeleton className="h-3.5 w-24" />
          </div>
        ))}
      </div>

      <Skeleton className="mt-8 mb-3.5 h-3.5 w-28" />
      <div className="space-y-2">
        <Skeleton className="h-15 w-full rounded-xl" />
        <Skeleton className="h-15 w-full rounded-xl" />
      </div>
    </div>
  );
}

function KanjiDetailContent({ kanjiId }: { kanjiId: number }) {
  const { user } = useAuth();
  const { data: kanji, status: kanjiStatus } = useKanjiDetail(kanjiId);
  const {
    data: progress,
    status: progressStatus,
    refetch: refetchProgress,
    mutate: mutateProgress,
  } = useKanjiProgress(user, kanjiId);

  if (kanjiStatus === "loading" || progressStatus === "loading") return <DetailSkeleton />;
  if (!kanji) return <NotFound />;

  const hasProgress = progress ? progress.meaning !== null || progress.readings.length > 0 : false;
  const colLabel = "mb-1 text-[0.72rem] font-extrabold uppercase tracking-[1px] text-text-muted";

  return (
    <div>
      <Link href="/browse/kanji" prefetch={false} className={buttonClasses({ variant: "secondary", size: "sm", hover: "hover", className: "mb-6" })}>
        ← Back to results
      </Link>

      <div className="mb-7.5 flex flex-wrap items-center gap-7.5">
        <div className="text-8xl leading-none mx-auto">{kanji.kanji}</div>
        <div className="min-w-55 flex-1">
          <div className="mb-3 text-[1.35rem] font-bold">{kanji.meanings?.join(", ")}</div>
          <div className="flex flex-wrap gap-6">
            <div>
              <div className={colLabel}>Kun reading</div>
              <div className="text-[1.1rem] font-bold">{kanji.kun_readings?.join("、") || "—"}</div>
            </div>
            <div>
              <div className={colLabel}>On reading</div>
              <div className="text-[1.1rem] font-bold">{kanji.on_readings?.join("、") || "—"}</div>
            </div>
            <div>
              <div className={colLabel}>JLPT level</div>
              <div className="text-[1.1rem] font-bold">
                <LevelBadge level={kanji.level} />
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 mb-3.5 text-[0.8rem] font-extrabold uppercase tracking-[1.2px] text-text-muted">Example words</div>
      <div className="grid grid-cols-1 gap-3 text-left">
        {kanji.words.map((w) => (
          <div
            className="flex flex-wrap items-center gap-x-8 gap-y-1.5 rounded-xl border border-border-soft bg-white/[0.03] px-3.5 py-3"
            key={w.id}
          >
            <div className="pt-[0.6em] text-3xl leading-none">
              {renderWordWithFurigana(w.vocabulary.word, w.vocabulary.furiganas, "text-base text-accent-blue", "bg-accent-blue/10")}
            </div>
            <div className="text-[0.85rem] text-text-muted">{w.vocabulary.meanings?.join(", ")}</div>
            <LevelBadge level={w.vocabulary.jlpt_level} size="md" className="ml-auto shrink-0" />
          </div>
        ))}
      </div>

      <div className="mt-8 mb-3.5 text-[0.8rem] font-extrabold uppercase tracking-[1.2px] text-text-muted">Your progress</div>
      {hasProgress && progress ? (
        <div>
          {progress.meaning && (
            <div className="mb-2 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border-soft bg-white/[0.02] px-4.5 py-3.5">
              <div className="text-[0.92rem] font-bold">Meaning — &quot;{kanji.meanings?.[0] ?? kanji.kanji}&quot;</div>
              <div className="flex flex-wrap items-center gap-3.5">
                <div className="flex flex-wrap items-center gap-3.5">
                  <StatusPill status={progress.meaning.status} />
                  <span className="text-[0.8rem] tabular-nums text-text-muted">due {formatDueAt(progress.meaning.due_at)}</span>
                </div>
                <CardActions
                  type="meaning"
                  id={kanji.id}
                  status={progress.meaning.status}
                  onOptimisticUpdate={(action) =>
                    mutateProgress((prev) => {
                      if (!prev) return prev;
                      // Reset forgets the whole kanji server-side (see lib/data/cards.ts), readings included.
                      if (action === "reset") return { ...prev, meaning: null, readings: [] };
                      return prev.meaning ? { ...prev, meaning: { ...prev.meaning, status: "suspended" } } : prev;
                    })
                  }
                  onSuccess={refetchProgress}
                  onError={refetchProgress}
                />
              </div>
            </div>
          )}
          {progress.readings.map((r) => (
            <div
              className="mb-2 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border-soft bg-white/[0.02] px-4.5 py-3.5"
              key={r.id}
            >
              <div className="text-[0.92rem] font-bold">
                Reading — {r.kanji_word?.vocabulary?.word ?? "—"}
                {r.kanji_word?.vocabulary?.kana_reading && (
                  <span className="font-semibold text-text-muted"> ({r.kanji_word.vocabulary.kana_reading})</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3.5">
                <div className="flex flex-wrap items-center gap-3.5">
                  <StatusPill status={r.status} />
                  <span className="text-[0.8rem] tabular-nums text-text-muted">due {formatDueAt(r.due_at)}</span>
                </div>
                <CardActions
                  type="reading"
                  id={r.kanji_word_id}
                  status={r.status}
                  onOptimisticUpdate={(action) =>
                    mutateProgress((prev) => {
                      if (!prev) return prev;
                      if (action === "reset") return { ...prev, readings: prev.readings.filter((reading) => reading.id !== r.id) };
                      return {
                        ...prev,
                        readings: prev.readings.map((reading) => (reading.id === r.id ? { ...reading, status: "suspended" } : reading)),
                      };
                    })
                  }
                  onSuccess={refetchProgress}
                  onError={refetchProgress}
                />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-dashed border-border-soft bg-white/[0.02] px-5 py-4.5 text-[0.92rem] text-text-muted">
          You haven&apos;t started this kanji yet. It&apos;ll appear here once it comes up in your normal study queue.
        </div>
      )}
    </div>
  );
}

function KanjiDetailFromQuery() {
  const searchParams = useSearchParams();
  const kanjiId = Number(searchParams.get("id"));
  if (!searchParams.get("id") || Number.isNaN(kanjiId)) return <NotFound />;
  return <KanjiDetailContent kanjiId={kanjiId} />;
}

export default function KanjiDetailPage() {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <KanjiDetailFromQuery />
    </Suspense>
  );
}
