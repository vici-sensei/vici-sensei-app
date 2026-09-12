"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FaCheck, FaXmark } from "react-icons/fa6";
import {
  useReadingTestSentences,
  useReadingTestProgress,
  useReadingTestSession,
} from "@/lib/client-data/readingTest";
import { buildKanaRomajiMap } from "@/lib/study/readingTestFurigana";
import { useStudyOnboarding } from "@/lib/study/StudyOnboardingContext";
import { useToast } from "@/app/components/ui/Toast";
import { useViewportHeight } from "@/lib/useViewportHeight";
import { useKeyboardOpen } from "@/lib/useKeyboardOpen";
import { ReadingTestSentenceRow } from "@/app/components/readingTest/ReadingTestSentenceRow";
import { ReadingTestAnswerForm } from "@/app/components/readingTest/ReadingTestAnswerForm";
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
  const keyboardOpen = useKeyboardOpen();
  const [answerSlot, setAnswerSlot] = useState<HTMLDivElement | null>(null);
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
  const {
    session,
    status: sessionStatus,
    error: sessionError,
    markStarted,
    ensureQueue,
    advance,
    saveDraft,
    clearDraft,
  } = useReadingTestSession(user.id, testType);
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

  // This pass's queue -- frozen the moment pendingIds and the server session are both available,
  // so it's exactly "every sentence still open when I arrived" (everything, on a first attempt;
  // just the reopened wrong ones, on a retry) and doesn't shift as answers come in. Walked one at
  // a time via currentIndex below; the progress bar and correct/wrong counts are scoped to this
  // frozen set too, so a retry shows its own small progress instead of the whole test's. If the
  // session already has a queue (this device resuming, or another device having frozen it first),
  // that order wins -- otherwise a fresh shuffle is proposed via ensureQueue, which atomically
  // defers to whichever device's shuffle lands first (see reading_test_ensure_queue). Shuffled
  // fresh on every retry (queue_order is cleared server-side, see reading_test_retry_wrong) so a
  // student needing several retries doesn't see the same remaining words in the same relative
  // order every time and learn the position instead of the reading.
  const [passQueueIds, setPassQueueIds] = useState<number[] | null>(null);
  useEffect(() => {
    if (passQueueIds !== null || !pendingIds || !session) return;
    if (session.queueOrder) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPassQueueIds(session.queueOrder);
      return;
    }
    if (pendingIds.length === 0) {
      setPassQueueIds([]);
      return;
    }
    ensureQueue(shuffle(pendingIds)).then(setPassQueueIds);
  }, [pendingIds, session, passQueueIds, ensureQueue]);

  // Which question this pass is on -- seeded once from the server's queue_position (only bumped
  // by Next, never by Check, so resuming mid-result-screen lands back on the same question rather
  // than skipping past it) and then walked locally by handleNext, which also persists the new
  // value so another device/tab picks up from here too.
  const [currentIndex, setCurrentIndex] = useState<number | null>(null);
  useEffect(() => {
    if (currentIndex !== null || !session || !passQueueIds) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCurrentIndex(Math.min(session.queuePosition, Math.max(passQueueIds.length - 1, 0)));
  }, [session, passQueueIds, currentIndex]);

  // Gates the progress bar/question behind an explicit "Start" tap -- until then, this pass's
  // queue is already loading/frozen in the background, but the student only sees the intro copy
  // and the Start button, not the bar or the first word. Seeded from the server session (see
  // markReadingTestStarted) so a DIFFERENT device/tab skips the intro too, even before this test's
  // first answer is in -- `alreadyAnswered` below still covers a session fetched before that first
  // Start finished persisting.
  const [started, setStarted] = useState<boolean | null>(null);
  useEffect(() => {
    if (started !== null || !session) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setStarted(session.started);
  }, [session, started]);

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
    if (!passQueueIds || currentIndex === null) return;
    const next = currentIndex + 1;
    if (next < passQueueIds.length) {
      setCurrentIndex(next);
      advance(next).catch(() => {});
      return;
    }
    window.location.href = passed
      ? `/study/test/${testType}/summary?justFinished=1`
      : `/study/test/${testType}/summary`;
  };

  if (
    sentencesStatus === "loading" ||
    progressStatus === "loading" ||
    sessionStatus === "loading" ||
    !passQueueIds ||
    currentIndex === null ||
    started === null
  ) {
    return <FullScreenLoader />;
  }

  if (
    sentencesStatus === "error" ||
    !sentences ||
    progressStatus === "error" ||
    !progress ||
    sessionStatus === "error" ||
    !session
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
            {sentencesError ?? progressError ?? sessionError ?? "Please try again."}
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

  // Belt-and-suspenders alongside `started`: covers the rare case of a session fetched before this
  // test's very first Start click finished persisting (e.g. two tabs opened at nearly the same
  // moment) -- any progress row at all still proves the intro was already passed.
  const alreadyAnswered = progress.size > 0;

  if (!started && !alreadyAnswered) {
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
            <Button
              onClick={() => {
                setStarted(true);
                markStarted().catch(() => {});
              }}
            >
              Start
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // The romaji input + Check button, or null once this question already has a result. The Check
  // button always renders here (near the page's own Next button); the input is a single portaled
  // node that ReadingTestAnswerForm relocates between the row's original spot and next to this
  // button as the on-screen keyboard opens/closes -- see that component's doc comment for why.
  const answerForm = !progress.has(currentSentence.id) ? (
    <ReadingTestAnswerForm
      key={`answer-${currentSentence.id}`}
      sentence={currentSentence}
      initialDraft={session.draftSentenceId === currentSentence.id ? session.draftAnswer : ""}
      onCheck={handleCheck}
      onDraftChange={(sentenceId, value) => {
        saveDraft(sentenceId, value).catch(() => {});
      }}
      onDraftClear={() => {
        clearDraft().catch(() => {});
      }}
      topSlot={answerSlot}
      keyboardOpen={keyboardOpen}
    />
  ) : null;

  return (
    <div
      className="overflow-hidden p-8"
      style={{ height: "var(--app-height, 100dvh)" }}
    >
      <div className="mx-auto w-full max-w-[640px] h-full flex flex-col gap-4 items-center overflow-hidden">
        <div className="shrink-0 flex flex-row w-full gap-8 items-center">
          <ReadingTestCloseButton />
          <div className="w-full flex flex-col gap-1">
            <div className="flex items-center justify-between text-[0.85rem] font-bold tabular-nums text-text-muted leading-none">
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
        </div>

        {/* The only scrollable region -- min-h-0 lets it shrink below its content's natural
            height instead of pushing the header/footer off-screen, and its own overflow-y-auto
            keeps any overflow an internal scrollbar here rather than a whole-page one. Just as
            important for the on-screen keyboard: since this is the sole scrollable ancestor,
            the browser's native "scroll focused input into view" can only ever act on this
            region, never on the header or the Check/Next row below it. */}
        <div className="min-h-0 flex-1 w-full overflow-y-auto flex flex-col items-center">
          <ReadingTestSentenceRow
            key={`row-${currentSentence.id}`}
            sentence={currentSentence}
            kanaRomajiMap={kanaRomajiMap}
            testType={testType}
            initialAnswer={progress.get(currentSentence.id) ?? null}
            onNext={handleNext}
            onAnswerSlotReady={setAnswerSlot}
          />
        </div>

        <div className="shrink-0">
          {progress.has(currentSentence.id) ? (
            <button
              key={`next-${currentSentence.id}`}
              type="button"
              onClick={handleNext}
              autoFocus
              className="w-fit cursor-pointer rounded-lg border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-bold text-white outline-none transition-colors hover:border-white/20 hover:bg-white/[0.07] focus-visible:border-white/20"
            >
              Next
            </button>
          ) : (
            answerForm
          )}
        </div>
      </div>
    </div>
  );
}
