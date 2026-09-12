"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FaCheck, FaXmark } from "react-icons/fa6";
import {
  useReadingTestSentences,
  useReadingTestProgress,
} from "@/lib/client-data/readingTest";
import { buildKanaRomajiMap } from "@/lib/study/readingTestFurigana";
import { useStudyOnboarding } from "@/lib/study/StudyOnboardingContext";
import { useToast } from "@/app/components/ui/Toast";
import { useViewportHeight } from "@/lib/useViewportHeight";
import { ReadingTestSentenceRow } from "@/app/components/readingTest/ReadingTestSentenceRow";
import { ReadingTestCloseButton } from "@/app/components/readingTest/ReadingTestCloseButton";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { Button } from "@/app/components/ui/Button";
import type { BrowseKanaEntry } from "@/lib/types";

function shuffle<T>(items: T[]): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

interface Props {
  testType: "hiragana" | "katakana";
  /** Browse's reference table for this script (character -> romaji, incl. yoon/sokuon/n-gemination
   * combos), loaded by the caller since it comes from a different hook per script
   * (useHiraganaList/useKatakanaList) -- used to build the full post-answer romaji reading. */
  kanaEntries: BrowseKanaEntry[] | null;
}

/** Shared implementation behind both /study/test/hiragana and /study/test/katakana -- fixed
 * text, one attempt per sentence, shown one at a time. Both outcomes are persisted (see
 * user_reading_test_progress's doc comment), so a sentence stays locked across a refresh/reopen
 * once answered, right or wrong -- only the summary page's "Retry the ones I got wrong" reopens a
 * wrong one. Once every sentence in this pass has a result, advancing past the last one redirects
 * to the score screen. The only per-script differences are `kanaEntries` above and hiragana's
 * extra "trickier than they look" blurb below (katakana's ー hint would give too much away, so
 * ReadingTestSentenceRow only offers it for hiragana). */
export function ReadingTestPage({ testType, kanaEntries }: Props) {
  const router = useRouter();
  useViewportHeight();
  const { user } = useStudyOnboarding();
  const { showToast } = useToast();
  const {
    data: sentences,
    status: sentencesStatus,
    error: sentencesError,
  } = useReadingTestSentences(testType);
  const {
    progress,
    status: progressStatus,
    error: progressError,
    markAnswered,
  } = useReadingTestProgress(user.id, testType);
  const kanaRomajiMap = useMemo(
    () => (kanaEntries ? buildKanaRomajiMap(kanaEntries) : null),
    [kanaEntries],
  );

  // Sentences with no saved attempt yet -- safe to recompute live (unlike a "frozen at load"
  // set) because a sentence only ever LEAVES this list (the moment it gets any result) and can
  // only re-enter it via the summary page's retryWrong, which happens on a different page mount.
  const pendingIds = useMemo(
    () =>
      sentences && progress
        ? sentences.filter((s) => !progress.has(s.id)).map((s) => s.id)
        : null,
    [sentences, progress],
  );

  // This pass's queue -- frozen the moment pendingIds is first available, so it's exactly "every
  // sentence still open when I arrived" (everything, on a first attempt; just the reopened wrong
  // ones, on a retry) and doesn't shift as answers come in. Walked one at a time via currentIndex
  // below; the progress bar and correct/wrong counts are scoped to this frozen set too, so a
  // retry shows its own small progress instead of the whole test's. Shuffled on every freeze (not
  // just once) so both a first attempt and each retry get a fresh order -- otherwise a student
  // needing several retries would see the same remaining words in the same relative order every
  // time and could learn the position instead of the reading.
  const [passQueueIds, setPassQueueIds] = useState<number[] | null>(null);
  useEffect(() => {
    if (passQueueIds !== null || !pendingIds) return;
    // Freezing this pass's queue the first render it's available; can't be a plain useMemo since
    // it must NOT recompute once answers start coming in.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPassQueueIds(shuffle(pendingIds));
  }, [pendingIds, passQueueIds]);

  const [currentIndex, setCurrentIndex] = useState(0);
  // Gates the progress bar/question behind an explicit "Start" tap -- until then, this pass's
  // queue is already loading/frozen in the background, but the student only sees the intro
  // copy and the Start button, not the bar or the first word.
  const [started, setStarted] = useState(false);

  const passed =
    sentences != null &&
    progress != null &&
    sentences.length > 0 &&
    [...progress.values()].filter((a) => a.correct).length >= sentences.length;

  // Nothing was pending when this page loaded -- either this pass was already fully answered
  // before this visit (revisiting a locked/finished pass) or there are no sentences at all.
  // Either way there's no question to show, so redirect immediately: straight to the dashboard if
  // that prior pass had already reached 100% (nothing new to celebrate, stays locked), to the
  // summary otherwise.
  //
  // A hard navigation (not router.push) -- this app's client-side router can reuse the summary
  // page's already-mounted instance when revisiting it (e.g. the retry loop bounces test ->
  // summary -> test -> summary within the same session), which would skip useReadingTestProgress's
  // fetch and show the score from before this pass. A full navigation guarantees a fresh mount, so
  // the score/attempt count on screen can never be stale.
  useEffect(() => {
    if (!passQueueIds || passQueueIds.length > 0) return;
    if (passed) {
      router.replace("/dashboard");
      return;
    }
    window.location.href = `/study/test/${testType}/summary`;
  }, [passQueueIds, passed, router, testType]);

  const handleCheck = (
    sentenceId: number,
    correct: boolean,
    userAnswer: string,
  ) => {
    markAnswered(sentenceId, correct, userAnswer).catch(() => {
      showToast(
        "Couldn't save that answer — it may not be there if you reload.",
        "error",
      );
    });
  };

  // Advances to the next question in this pass, or -- once every question in it has a result --
  // does the same hard navigation to the summary the redirect effect above does, except this one
  // only fires from the student's own Next click on the LAST question, so they always get to see
  // that question's result before the page changes.
  const handleNext = () => {
    if (!passQueueIds) return;
    const next = currentIndex + 1;
    if (next < passQueueIds.length) {
      setCurrentIndex(next);
      return;
    }
    window.location.href = passed
      ? `/study/test/${testType}/summary?justFinished=1`
      : `/study/test/${testType}/summary`;
  };

  if (
    sentencesStatus === "loading" ||
    progressStatus === "loading" ||
    !passQueueIds
  ) {
    return <FullScreenLoader />;
  }

  if (
    sentencesStatus === "error" ||
    !sentences ||
    progressStatus === "error" ||
    !progress
  ) {
    return (
      <div
        className="flex items-center justify-center overflow-y-auto px-6 py-[60px] text-center"
        style={{ height: "var(--app-height, 100dvh)" }}
      >
        <div className="w-full max-w-[380px]">
          <ReadingTestCloseButton />
          <h1 className="mb-2 text-lg font-bold text-white">
            Couldn&apos;t load the reading test
          </h1>
          <p className="text-[0.9rem] leading-[1.6] text-text-muted">
            {sentencesError ?? progressError ?? "Please try again."}
          </p>
        </div>
      </div>
    );
  }

  const currentSentence =
    sentences.find((s) => s.id === passQueueIds[currentIndex]) ?? null;

  if (!currentSentence) {
    // Just answered the last question in this pass -- the redirect effect above is about to
    // navigate away.
    return <FullScreenLoader />;
  }

  const answeredCount = passQueueIds.filter((id) => progress.has(id)).length;
  const correctCount = passQueueIds.filter(
    (id) => progress.get(id)?.correct,
  ).length;
  const wrongCount = answeredCount - correctCount;
  const percent = Math.round((answeredCount / passQueueIds.length) * 100);

  if (!started) {
    return (
      <div
        className="overflow-y-auto p-8"
        style={{ height: "var(--app-height, 100dvh)" }}
      >
        <div className="mx-auto w-full max-w-[640px] h-full flex flex-col gap-8 justify-between">
          <ReadingTestCloseButton />
          <div className="h-full flex flex-col gap-8 justify-center">
            <h1 className="text-[1.6rem] font-extrabold leading-[1.25] text-white text-center">
              Let&apos;s read some words
            </h1>
            <div>
              <p className="text-[0.9rem] leading-[1.6] text-text-muted">
                Type the romaji reading for each word below, then press Check to
                see it.
              </p>
              {testType === "hiragana" && (
                <p className="text-[0.9rem] leading-[1.6] text-text-muted">
                  A couple of words are trickier than they look, so you&apos;ll
                  find their reading written above them as a hint.
                </p>
              )}
            </div>
          </div>
          <div className="mx-auto">
            <Button onClick={() => setStarted(true)}>Start</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="overflow-y-auto px-4 py-8"
      style={{ height: "var(--app-height, 100dvh)" }}
    >
      <div className="mx-auto w-full max-w-[640px]">
        <ReadingTestCloseButton />
        <div className="mb-8">
          <div className="mb-2 flex items-center justify-between text-[0.85rem] font-bold tabular-nums text-text-muted">
            <span>
              {answeredCount} / {passQueueIds.length}
            </span>
            <span className="flex items-center gap-3">
              <span className="flex items-center gap-1 text-accent-green">
                <FaCheck className="h-3 w-3" />
                {correctCount}
              </span>
              <span className="flex items-center gap-1 text-accent-red">
                <FaXmark className="h-3 w-3" />
                {wrongCount}
              </span>
            </span>
          </div>
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-accent-blue transition-[width] duration-400 ease-linear"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        <ReadingTestSentenceRow
          key={currentSentence.id}
          sentence={currentSentence}
          kanaRomajiMap={kanaRomajiMap}
          userId={user.id}
          testType={testType}
          onCheck={handleCheck}
          onNext={handleNext}
        />
      </div>
    </div>
  );
}
