"use client";

import { Suspense } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useVocabularyDetail } from "@/lib/client-data/vocabulary";
import { useVocabularyProgress } from "@/lib/client-data/progress";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { ProgressCardRow, PlaceholderProgressCardRow, EmptyProgressNotice } from "@/app/components/browse/ProgressCardRow";
import { BrowseBackLink, BrowseNotFound } from "@/app/components/browse/BrowseDetailNav";
import { OtherMeaningsToggle } from "@/app/components/browse/OtherMeaningsToggle";
import { CopyWordButton } from "@/app/components/browse/CopyWordButton";
import { BrowseFact, BrowseSectionTitle } from "@/app/components/browse/BrowseDetailParts";
import { PlaceholderRubyWord } from "@/app/components/browse/PlaceholderRubyWord";
import { KanjiHint } from "@/app/components/study/KanjiHint";
import { usePressableKanji } from "@/app/components/study/usePressableKanji";
import { renderVocabularyWord, vocabularyDisplayText } from "@/lib/study/furigana";
import { useNumericIdParam } from "@/lib/browse/useNumericIdParam";

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

function VocabularyDetailPlaceholder() {
  return (
    <div>
      <BrowseBackLink href="/browse/vocabulary" />

      <div className="mb-7.5 flex flex-wrap items-center gap-7.5">
        <div className="min-w-55 flex-1">
          <PlaceholderRubyWord size="lg" className="mb-3" />
          <div className="mb-3 flex h-[32.4px] items-center">
            <Skeleton className="h-5 w-full" />
          </div>
          <div className="flex flex-wrap gap-6">
            <BrowseFact label="Part of speech">
              <div className="flex h-6 items-center">
                <Skeleton className="h-4 w-20" />
              </div>
            </BrowseFact>
            <BrowseFact label="JLPT level">
              <LevelBadge level={null} loading />
            </BrowseFact>
            <BrowseFact label="Other readings">
              <div className="flex h-6 items-center">
                <Skeleton className="h-4 w-24" />
              </div>
            </BrowseFact>
          </div>
        </div>
      </div>

      <BrowseSectionTitle>Your progress</BrowseSectionTitle>
      <PlaceholderProgressCardRow
        title={
          <>
            Meaning — <Skeleton className="h-4 flex-1 rounded" />
          </>
        }
      />
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
  // Every kanji of the word opens KanjiInfoModal (with a link to its own page) on click (double-tap on
  // touch) -- none when it's shown as kana only. Called before the early returns below: it's a hook.
  const wordText = word ? vocabularyDisplayText(word) : "";
  const { renderKanji, pressProps, kanjiModal, showKanjiHint } = usePressableKanji(wordText, null, "dictionary");

  if (wordStatus === "loading" || progressStatus === "loading") return <VocabularyDetailPlaceholder />;
  if (!word) return <NotFound />;

  return (
    <div>
      <BrowseBackLink href="/browse/vocabulary" />

      <div className="mb-7.5 flex flex-wrap items-center gap-7.5">
        <div className="min-w-55 flex-1">
          <div className="mb-3 flex items-end gap-3">
            <div {...pressProps} className="pt-[0.6em] text-5xl leading-[1.1]">
              {renderVocabularyWord(word, "text-lg text-accent-blue", "bg-accent-blue/10", true, renderKanji)}
            </div>
            {/* The pressable kanji above can't be selected -- this is how the word gets copied. */}
            <CopyWordButton text={wordText} className="mb-2" />
          </div>
          {showKanjiHint && <KanjiHint className="mb-3" />}
          {kanjiModal}
          <div className="mb-3 text-[1.35rem] font-bold">{word.primary_meanings?.join(", ")}</div>
          <OtherMeaningsToggle otherMeanings={word.other_meanings} className="mb-3" />
          <div className="flex flex-wrap gap-6">
            <BrowseFact label="Part of speech">
              <div className="text-base font-bold">{word.parts_of_speech?.join(", ") || "—"}</div>
            </BrowseFact>
            <BrowseFact label="JLPT level">
              <div className="text-base font-bold">
                <LevelBadge level={word.jlpt_level} />
              </div>
            </BrowseFact>
            <BrowseFact label="Other readings">
              <div className="text-base font-bold text-text-muted">{word.other_readings?.join(", ") || "—"}</div>
            </BrowseFact>
          </div>
        </div>
      </div>

      <BrowseSectionTitle>Your progress</BrowseSectionTitle>
      {progress ? (
        <ProgressCardRow
          title={<>Meaning — &quot;{word.primary_meanings?.[0] ?? vocabularyDisplayText(word)}&quot;</>}
          status={progress.status}
          dueAt={progress.due_at}
          cardType="vocab"
          cardId={word.id}
          onOptimisticUpdate={(action) =>
            mutateProgress((prev) => {
              if (action === "reset") return null;
              // Reactivate's real target status isn't known client-side (only status_before,
              // server-side, has it) -- leave it be and let onSuccess's refetch settle it.
              if (action === "reactivate") return prev;
              return prev ? { ...prev, status: "suspended" } : prev;
            })
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
  const wordId = useNumericIdParam();
  if (wordId === null) return <NotFound />;
  return <VocabularyDetailContent wordId={wordId} />;
}

export default function VocabularyDetailPage() {
  return (
    <Suspense fallback={<DetailSkeleton />}>
      <VocabularyDetailFromQuery />
    </Suspense>
  );
}
