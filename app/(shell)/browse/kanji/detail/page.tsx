"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useKanjiDetail } from "@/lib/client-data/kanji";
import { useKanjiProgress } from "@/lib/client-data/progress";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { ProgressCardRow, PlaceholderProgressCardRow, EmptyProgressNotice } from "@/app/components/browse/ProgressCardRow";
import { BrowseBackLink, BrowseNotFound } from "@/app/components/browse/BrowseDetailNav";
import { renderWordWithFurigana } from "@/lib/study/furigana";

function NotFound() {
  return <BrowseNotFound title="Kanji not found" message="This kanji doesn't exist or may have been removed." backHref="/browse/kanji" />;
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

// Word block for a fictional example word: 2 kanji, each with its own 2-kana furigana above --
// same shape as PlaceholderWord on the vocabulary list, sized for this row's tighter padding
// (leading-none here vs. the list's default line-height, so the real box is shorter: 54 vs 57.3px).
function PlaceholderExampleWord() {
  return (
    <div className="flex h-[54px] shrink-0 items-end gap-1.5">
      {[0, 1].map((k) => (
        <div key={k} className="flex flex-col items-center gap-1">
          <Skeleton className="h-3 w-5 rounded" />
          <Skeleton className="h-9 w-8 rounded-md" />
        </div>
      ))}
    </div>
  );
}

function KanjiDetailPlaceholder() {
  const colLabel = "mb-1 text-[0.72rem] font-extrabold uppercase tracking-[1px] text-text-muted";

  return (
    <div>
      <BrowseBackLink href="/browse/kanji" />

      <div className="mb-7.5 flex flex-wrap items-center gap-7.5">
        <Skeleton className="h-24 w-24 shrink-0 rounded-2xl" />
        <div className="min-w-55 flex-1">
          <div className="mb-3 flex h-[32.4px] items-center">
            <Skeleton className="h-5 w-full" />
          </div>
          <div className="flex flex-wrap gap-6">
            <div>
              <div className={colLabel}>Kun reading</div>
              <div className="flex h-[26.4px] items-center">
                <Skeleton className="h-4.5 w-24" />
              </div>
            </div>
            <div>
              <div className={colLabel}>On reading</div>
              <div className="flex h-[26.4px] items-center">
                <Skeleton className="h-4.5 w-20" />
              </div>
            </div>
            <div>
              <div className={colLabel}>JLPT level</div>
              <LevelBadge level={null} loading />
            </div>
          </div>
        </div>
      </div>

      <div className="mt-8 mb-3.5 text-[0.8rem] font-extrabold uppercase tracking-[1.2px] text-text-muted">Example words</div>
      <div className="grid grid-cols-1 gap-3 text-left">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            className="flex flex-wrap items-center gap-x-8 gap-y-1.5 rounded-xl border border-border-soft bg-white/[0.03] px-3.5 py-3"
            key={i}
          >
            <PlaceholderExampleWord />
            <div className="min-w-32 flex-1">
              <Skeleton className="h-3.5 w-full" />
            </div>
            <LevelBadge level={null} loading size="md" className="ml-auto shrink-0" />
          </div>
        ))}
      </div>

      <div className="mt-8 mb-3.5 text-[0.8rem] font-extrabold uppercase tracking-[1.2px] text-text-muted">Your progress</div>
      <div>
        <PlaceholderProgressCardRow
          title={
            <>
              Meaning — <Skeleton className="h-4 flex-1 rounded" />
            </>
          }
        />
        <PlaceholderProgressCardRow
          showReset={false}
          title={
            <>
              Reading — <Skeleton className="h-4 w-14 shrink-0 rounded" />
              <Skeleton className="h-3.5 w-20 shrink-0 rounded" />
            </>
          }
        />
        <PlaceholderProgressCardRow
          showReset={false}
          title={
            <>
              Reading — <Skeleton className="h-4 w-12 shrink-0 rounded" />
              <Skeleton className="h-3.5 w-16 shrink-0 rounded" />
            </>
          }
        />
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

  if (kanjiStatus === "loading" || progressStatus === "loading") return <KanjiDetailPlaceholder />;
  if (!kanji) return <NotFound />;

  const hasProgress = progress ? progress.meaning !== null || progress.readings.length > 0 : false;
  const colLabel = "mb-1 text-[0.72rem] font-extrabold uppercase tracking-[1px] text-text-muted";

  return (
    <div>
      <BrowseBackLink href="/browse/kanji" />

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
            <ProgressCardRow
              title={<>Meaning — &quot;{kanji.meanings?.[0] ?? kanji.kanji}&quot;</>}
              status={progress.meaning.status}
              dueAt={progress.meaning.due_at}
              cardType="meaning"
              cardId={kanji.id}
              onOptimisticUpdate={(action) =>
                mutateProgress((prev) => {
                  if (!prev) return prev;
                  // Reset forgets the whole kanji server-side (see lib/data/cards.ts), readings included.
                  if (action === "reset") return { ...prev, meaning: null, readings: [] };
                  // Reactivate's real target status isn't known client-side (only status_before,
                  // server-side, has it) -- leave it be and let onSuccess's refetch settle it.
                  if (action === "reactivate") return prev;
                  // Suspending the meaning card pauses the whole kanji server-side (see
                  // lib/data/cards.ts), so its reading cards suspend along with it here too.
                  return prev.meaning
                    ? {
                        ...prev,
                        meaning: { ...prev.meaning, status: "suspended" },
                        readings: prev.readings.map((reading) => ({ ...reading, status: "suspended" })),
                      }
                    : prev;
                })
              }
              onSuccess={refetchProgress}
              onError={refetchProgress}
            />
          )}
          {progress.readings.map((r) => (
            <ProgressCardRow
              key={r.id}
              title={
                <>
                  Reading — {r.kanji_word?.vocabulary?.word ?? "—"}
                  {r.kanji_word?.vocabulary?.kana_reading && (
                    <span className="font-semibold text-text-muted"> ({r.kanji_word.vocabulary.kana_reading})</span>
                  )}
                </>
              }
              status={r.status}
              dueAt={r.due_at}
              cardType="reading"
              cardId={r.kanji_word_id}
              onOptimisticUpdate={(action) =>
                mutateProgress((prev) => {
                  if (!prev) return prev;
                  if (action === "reset") return { ...prev, readings: prev.readings.filter((reading) => reading.id !== r.id) };
                  if (action === "reactivate") return prev;
                  return {
                    ...prev,
                    readings: prev.readings.map((reading) => (reading.id === r.id ? { ...reading, status: "suspended" } : reading)),
                  };
                })
              }
              onSuccess={refetchProgress}
              onError={refetchProgress}
            />
          ))}
        </div>
      ) : (
        <EmptyProgressNotice>
          You haven&apos;t started this kanji yet. It&apos;ll appear here once it comes up in your normal study queue.
        </EmptyProgressNotice>
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
