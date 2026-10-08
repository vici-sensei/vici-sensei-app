"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FaUnlock } from "react-icons/fa6";
import { celebrate } from "@/lib/confetti";
import { useReadingTestSentences, useReadingTestProgress, useReadingTestAttempt } from "@/lib/client-data/readingTest";
import { useStudyOnboarding } from "@/lib/study/StudyOnboardingContext";
import { useOnPageRestored } from "@/lib/useOnPageRestored";
import { useToast } from "@/app/components/ui/Toast";
import { Badge } from "@/app/components/ui/Badge";
import { Button } from "@/app/components/ui/Button";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { FullScreenMessage } from "@/app/components/ui/FullScreenMessage";
import { CelebrationBackdrop } from "@/app/components/ui/CelebrationBackdrop";
import { useUnacknowledgedAchievements } from "@/app/components/study/useUnacknowledgedAchievements";
import { ReadingTestMissedList } from "@/app/components/readingTest/ReadingTestMissedList";

type TestType = "hiragana" | "katakana";

/** The only wording that differs between the two tests: what a test item is called (the hiragana
 * test asks for sentences, the katakana one for words) and what passing it unlocks. */
const COPY: Record<TestType, { items: string; unlockedBadge: string; passedMessage: string }> = {
  hiragana: {
    items: "sentences",
    unlockedBadge: "Katakana unlocked",
    passedMessage: "You got every word right — katakana is now unlocked in your queue.",
  },
  katakana: {
    items: "words",
    unlockedBadge: "Kanji unlocked",
    passedMessage: "You got every word right — kanji and vocabulary are now unlocked in your queue.",
  },
};

// Only these two keys can ever be awarded by finishing a test (reading_test_progress_updates_status
// trigger, 20260925_test_status_feeds_achievements.sql) -- a small, fixed lookup, not a broad
// "anything recent" scan.
const TEST_ACHIEVEMENT_KEYS: Record<TestType, string[]> = {
  hiragana: ["hiragana_test", "hiragana_test_100"],
  katakana: ["katakana_test", "katakana_test_100"],
};

/** Score screen for a kana reading test -- correct/total is always freshly derived from
 * user_reading_test_progress (via useReadingTestProgress), so it can never disagree with what the
 * DB triggers used to decide whether the next track (katakana after hiragana, kanji/vocabulary
 * after katakana) actually unlocked. At 100%, celebrates immediately here rather than waiting for
 * the next /study visit. Below 100%, "Retry" reopens every wrong item (see retryWrong) before
 * sending the student back to the test page.
 *
 * `?justFinished=1` (set only by the test page's own redirect, right after the pass that reached
 * 100%) is what lets this celebration render at all -- any other arrival at a passed test's
 * summary (back button, bookmark, nav) redirects straight to the dashboard instead, since both
 * the test and its summary are meant to stay locked once passed. */
function SummaryContent({ testType }: { testType: TestType }) {
  const copy = COPY[testType];
  const router = useRouter();
  const searchParams = useSearchParams();
  const justFinished = searchParams.get("justFinished") === "1";
  const { user } = useStudyOnboarding();
  const { showToast } = useToast();
  const { data: sentences, status: sentencesStatus, error: sentencesError } = useReadingTestSentences(testType);
  const {
    progress,
    status: progressStatus,
    error: progressError,
    retryWrong,
  } = useReadingTestProgress(user.id, testType);
  const { attempt, attemptStartedAt } = useReadingTestAttempt(user.id, testType);
  const [retrying, setRetrying] = useState(false);

  // Back from the full-page load to the test page restores this screen from bfcache still "retrying".
  useOnPageRestored(() => setRetrying(false));

  const total = sentences?.length ?? 0;
  const correct = progress ? [...progress.values()].filter((a) => a.correct).length : 0;
  const passed = total > 0 && correct >= total;

  // On a retry (attempt > 1), correct/total above cover the whole test's history -- including
  // items answered right back on attempt 1, which are locked and never re-asked (see
  // resetWrongAnswers). Showing those alongside a handful of just-reopened items would read as
  // "you got 18/20" when really only 2 were even asked this time. Once retrying, show this
  // retry's own tally instead: every progress row stamped after this attempt started (a locked
  // correct answer's attemptedAt always predates that, since it's never rewritten -- see
  // ReadingTestAnswer/fetchReadingTestAttempt) is a fresh answer from this retry's reopened set.
  const isRetry = attempt !== null && attempt > 1;
  const retryAnswers =
    isRetry && progress && attemptStartedAt
      ? [...progress.values()].filter((a) => new Date(a.attemptedAt) >= new Date(attemptStartedAt))
      : [];
  const displayCorrect = isRetry ? retryAnswers.filter((a) => a.correct).length : correct;
  const displayTotal = isRetry ? retryAnswers.length : total;
  const percent = displayTotal > 0 ? Math.round((displayCorrect / displayTotal) * 100) : 0;

  // Every wrong row still in progress -- on a retry that's already just this attempt's misses,
  // since retryWrong deletes the previous attempt's wrong rows (only correct ones stay locked).
  // In test order, since `sentences` is fetched ordered by sort_order.
  const missed =
    sentences && progress
      ? sentences.flatMap((sentence) => {
          const answer = progress.get(sentence.id);
          return answer && !answer.correct ? [{ sentence, answer }] : [];
        })
      : [];

  useEffect(() => {
    if (passed && !justFinished) {
      router.replace("/dashboard");
    }
  }, [passed, justFinished, router]);

  // See the hook for why this checks what's still unacknowledged rather than "earned since the test
  // page's redirect" (that redirect fires before the last answer is guaranteed to have been saved).
  const { modal: achievementsModal, done: badgesDone } = useUnacknowledgedAchievements(
    user.id,
    TEST_ACHIEVEMENT_KEYS[testType]
  );

  // Held until the new-badge modal (if any) has been closed, so the confetti doesn't rain over its
  // sakura petals -- a passed test is also what earns the perfect-score badge, so this is the
  // normal case here, not an edge.
  const celebratedRef = useRef(false);
  useEffect(() => {
    if (passed && justFinished && badgesDone && !celebratedRef.current) {
      celebratedRef.current = true;
      void celebrate();
    }
  }, [passed, justFinished, badgesDone]);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await retryWrong();
      // Hard navigation, not router.push -- see the matching note on the test page's own
      // redirect effect. Revisiting the test page here could otherwise reuse an already-mounted
      // (pre-retry) instance whose progress still shows the just-reopened item as locked.
      window.location.href = `/study/test/${testType}`;
    } catch {
      setRetrying(false);
      showToast(`Couldn't reopen those ${copy.items} — please try again.`, "error");
    }
  };

  if (sentencesStatus === "loading" || progressStatus === "loading" || !sentences || !progress) {
    return <FullScreenLoader />;
  }

  if (sentencesStatus === "error" || progressStatus === "error") {
    return (
      <FullScreenMessage title="Couldn't load your score">
        {sentencesError ?? progressError ?? "Please try again."}
      </FullScreenMessage>
    );
  }

  // Redirecting to the dashboard (see the effect above) -- avoid flashing the locked score screen.
  if (passed && !justFinished) {
    return <FullScreenLoader />;
  }

  return (
    <CelebrationBackdrop glow="gold" className="min-h-screen px-6 py-[60px]">
      <div className="relative w-full max-w-[480px] text-center">
        <Badge color={passed ? "gold" : "blue"}>
          <span className="inline-flex items-center gap-1.5">
            {passed && <FaUnlock className="h-3 w-3" />}
            {passed ? copy.unlockedBadge : "Reading test"}
          </span>
        </Badge>
        <h1 className="mb-2 mt-4.5 text-[1.8rem] font-extrabold leading-[1.25]">
          {passed ? "Perfect score!" : "Here's how you did"}
        </h1>
        <p className="mb-7 text-base leading-[1.6] text-text-muted">
          {passed ? copy.passedMessage : "Anything you haven't gotten right yet is still waiting for you below."}
        </p>
        <div className="mb-8.5 rounded-2xl border border-border-soft bg-bg-cards px-6 py-8 backdrop-blur-[10px]">
          <div className="text-[2.4rem] font-extrabold leading-none tracking-tight">
            {displayCorrect}
            <span className="text-[1.3rem] text-text-muted">/{displayTotal}</span>
          </div>
          <div className="mt-1.5 text-sm font-semibold text-text-muted">{percent}% correct</div>
        </div>
        {!passed && <ReadingTestMissedList items={missed} />}
        {passed ? (
          <Button className="w-full" onClick={() => router.push("/dashboard")}>
            Continue to dashboard
          </Button>
        ) : (
          <div className="flex flex-col gap-3">
            <Button className="w-full" onClick={handleRetry} loading={retrying}>
              Retry the ones I got wrong
            </Button>
            <Button variant="secondary" className="w-full" onClick={() => router.push("/dashboard")} disabled={retrying}>
              Not now
            </Button>
          </div>
        )}
      </div>
      {achievementsModal}
    </CelebrationBackdrop>
  );
}

/** Shared implementation behind both /study/test/hiragana/summary and /study/test/katakana/summary.
 * The Suspense boundary is needed for useSearchParams (static export). */
export function ReadingTestSummaryPage({ testType }: { testType: TestType }) {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <SummaryContent testType={testType} />
    </Suspense>
  );
}
