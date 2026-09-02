"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FaUnlock } from "react-icons/fa6";
import { celebrate } from "@/lib/confetti";
import { useReadingTestSentences, useReadingTestProgress, useReadingTestAttempt } from "@/lib/client-data/readingTest";
import { useStudyOnboarding } from "@/lib/study/StudyOnboardingContext";
import { useToast } from "@/app/components/ui/Toast";
import { Badge } from "@/app/components/ui/Badge";
import { Button } from "@/app/components/ui/Button";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";

const TEST_TYPE = "hiragana";

/** Score screen for the hiragana reading test -- correct/total is always freshly derived from
 * user_reading_test_progress (via useReadingTestProgress), so it can never disagree with what the
 * DB triggers used to decide whether katakana actually unlocked. At 100%, celebrates immediately
 * here rather than waiting for the next /study visit. Below 100%, "Retry" reopens every wrong
 * sentence (see retryWrong) before sending the student back to the test page.
 *
 * `?justFinished=1` (set only by the test page's own redirect, right after the pass that reached
 * 100%) is what lets this celebration render at all -- any other arrival at a passed test's
 * summary (back button, bookmark, nav) redirects straight to the dashboard instead, since both
 * the test and its summary are meant to stay locked once passed. */
function SummaryContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const justFinished = searchParams.get("justFinished") === "1";
  const { user } = useStudyOnboarding();
  const { showToast } = useToast();
  const { data: sentences, status: sentencesStatus, error: sentencesError } = useReadingTestSentences(TEST_TYPE);
  const {
    progress,
    status: progressStatus,
    error: progressError,
    retryWrong,
  } = useReadingTestProgress(user.id, TEST_TYPE);
  const { attempt } = useReadingTestAttempt(user.id, TEST_TYPE);
  const [retrying, setRetrying] = useState(false);

  const total = sentences?.length ?? 0;
  const correct = progress ? [...progress.values()].filter((a) => a.correct).length : 0;
  const passed = total > 0 && correct >= total;
  const percent = total > 0 ? Math.round((correct / total) * 100) : 0;

  useEffect(() => {
    if (passed && !justFinished) {
      router.replace("/dashboard");
    }
  }, [passed, justFinished, router]);

  const celebratedRef = useRef(false);
  useEffect(() => {
    if (passed && justFinished && !celebratedRef.current) {
      celebratedRef.current = true;
      void celebrate();
    }
  }, [passed, justFinished]);

  const handleRetry = async () => {
    setRetrying(true);
    try {
      await retryWrong();
      // Hard navigation, not router.push -- see the matching note on the test page's own
      // redirect effect. Revisiting the test page here could otherwise reuse an already-mounted
      // (pre-retry) instance whose progress still shows the just-reopened sentence as locked.
      window.location.href = "/study/test/hiragana";
    } catch {
      setRetrying(false);
      showToast("Couldn't reopen those sentences — please try again.", "error");
    }
  };

  if (sentencesStatus === "loading" || progressStatus === "loading" || !sentences || !progress) {
    return <FullScreenLoader />;
  }

  if (sentencesStatus === "error" || progressStatus === "error") {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 py-[60px] text-center">
        <div className="w-full max-w-[380px]">
          <h1 className="mb-2 text-lg font-bold text-white">Couldn&apos;t load your score</h1>
          <p className="text-[0.9rem] leading-[1.6] text-text-muted">
            {sentencesError ?? progressError ?? "Please try again."}
          </p>
        </div>
      </div>
    );
  }

  // Redirecting to the dashboard (see the effect above) -- avoid flashing the locked score screen.
  if (passed && !justFinished) {
    return <FullScreenLoader />;
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-[60px] before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_50%_15%,rgb(255_210_0/0.08)_0%,transparent_55%)]">
      <div className="relative w-full max-w-[480px] text-center">
        <Badge color={passed ? "gold" : "blue"}>
          <span className="inline-flex items-center gap-1.5">
            {passed && <FaUnlock className="h-3 w-3" />}
            {passed ? "Katakana unlocked" : "Reading test"}
          </span>
        </Badge>
        <h1 className="mb-2 mt-4.5 text-[1.8rem] font-extrabold leading-[1.25]">
          {passed ? "Perfect score!" : "Here's how you did"}
        </h1>
        <p className="mb-7 text-base leading-[1.6] text-text-muted">
          {passed
            ? "You got every sentence right — katakana is now unlocked in your queue."
            : "Anything you haven't gotten right yet is still waiting for you below."}
        </p>
        <div className="mb-8.5 rounded-2xl border border-border-soft bg-bg-cards px-6 py-8 backdrop-blur-[10px]">
          <div className="text-[2.4rem] font-extrabold leading-none tracking-tight">
            {correct}
            <span className="text-[1.3rem] text-text-muted">/{total}</span>
          </div>
          <div className="mt-1.5 text-sm font-semibold text-text-muted">{percent}% correct</div>
          {attempt != null && (
            <div className="mt-1 text-xs font-semibold uppercase tracking-[0.6px] text-text-muted/70">
              Attempt #{attempt}
            </div>
          )}
        </div>
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
    </div>
  );
}

export default function HiraganaReadingTestSummaryPage() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <SummaryContent />
    </Suspense>
  );
}
