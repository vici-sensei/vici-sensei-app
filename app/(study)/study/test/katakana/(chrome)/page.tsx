"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useReadingTestSentences, useReadingTestProgress } from "@/lib/client-data/readingTest";
import { useKatakanaList } from "@/lib/client-data/kana";
import { buildKanaRomajiMap } from "@/lib/study/readingTestFurigana";
import { useStudyOnboarding } from "@/lib/study/StudyOnboardingContext";
import { useToast } from "@/app/components/ui/Toast";
import { ReadingTestSentenceRow } from "@/app/components/readingTest/ReadingTestSentenceRow";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";

const TEST_TYPE = "katakana";

/** Katakana reading test -- fixed word list, one attempt per word. Both outcomes are persisted
 * (see user_reading_test_progress's doc comment), so a word stays locked across a
 * refresh/reopen once answered, right or wrong -- only the summary page's "Retry the ones I got
 * wrong" reopens a wrong one. Once every word has a result, redirects to the score screen. */
export default function KatakanaReadingTestPage() {
  const router = useRouter();
  const { user } = useStudyOnboarding();
  const { showToast } = useToast();
  const { data: sentences, status: sentencesStatus, error: sentencesError } = useReadingTestSentences(TEST_TYPE);
  const {
    progress,
    status: progressStatus,
    error: progressError,
    markAnswered,
  } = useReadingTestProgress(user.id, TEST_TYPE);
  // Reuses Browse's katakana reference table (character -> romaji, incl. yoon/sokuon/n-gemination
  // combos) to build the full post-answer romaji reading -- built once here, not per row, since
  // every ReadingTestSentenceRow shares the same lookup.
  const { data: katakanaEntries } = useKatakanaList();
  const kanaRomajiMap = useMemo(
    () => (katakanaEntries ? buildKanaRomajiMap(katakanaEntries) : null),
    [katakanaEntries]
  );

  // Words with no saved attempt yet -- safe to recompute live (unlike a "frozen at load"
  // set) because a word only ever LEAVES this list (the moment it gets any result) and can
  // only re-enter it via the summary page's retryWrong, which happens on a different page mount.
  const pendingIds = useMemo(
    () => (sentences && progress ? sentences.filter((s) => !progress.has(s.id)).map((s) => s.id) : null),
    [sentences, progress]
  );
  const [scrolledToFirst, setScrolledToFirst] = useState(false);
  const rowRefs = useRef(new Map<number, HTMLDivElement>());

  // Distinguishes "just answered the last pending word this visit" (worth a trip through the
  // summary's celebration) from "was already fully done before this page even loaded" (a revisit
  // of a 100%'d test, which should skip straight past both the test and its summary -- see below).
  const initialPendingCountRef = useRef<number | null>(null);
  useEffect(() => {
    if (pendingIds && initialPendingCountRef.current === null) {
      initialPendingCountRef.current = pendingIds.length;
    }
  }, [pendingIds]);

  const passed = sentences != null && progress != null && sentences.length > 0 && [...progress.values()].filter((a) => a.correct).length >= sentences.length;

  // Covers both "already 100% on load" and "just answered the last pending word" -- either
  // way, nothing left pending means this pass is done. A 100% pass that was ALREADY done before
  // this page loaded (revisiting a finished test) skips the summary entirely and goes straight to
  // the dashboard, since there's nothing new to celebrate and the test is meant to stay locked
  // once passed.
  //
  // A hard navigation (not router.push) on arrival at the summary -- this app's client-side
  // router can reuse that page's already-mounted instance when revisiting it (e.g. the retry
  // loop bounces test -> summary -> test -> summary within the same session), which would skip
  // useReadingTestProgress's fetch and show the score from before this pass. A full navigation
  // guarantees a fresh mount, so the score/attempt count on screen can never be stale.
  useEffect(() => {
    if (!pendingIds || !sentences || initialPendingCountRef.current === null) return;
    if (sentences.length === 0 || pendingIds.length > 0) return;
    if (passed && initialPendingCountRef.current === 0) {
      router.replace("/dashboard");
      return;
    }
    window.location.href = passed ? "/study/test/katakana/summary?justFinished=1" : "/study/test/katakana/summary";
  }, [pendingIds, sentences, passed, router]);

  // One-time scroll to the first pending word, so resuming after a refresh/exit doesn't
  // require scrolling back down through everything already answered.
  useEffect(() => {
    if (scrolledToFirst || !pendingIds || pendingIds.length === 0) return;
    const el = rowRefs.current.get(pendingIds[0]);
    if (!el) return;
    el.scrollIntoView({ behavior: "instant", block: "center" });
    setScrolledToFirst(true);
  }, [pendingIds, scrolledToFirst]);

  const handleCheck = (sentenceId: number, correct: boolean, userAnswer: string) => {
    markAnswered(sentenceId, correct, userAnswer).catch(() => {
      showToast("Couldn't save that answer — it may not be there if you reload.", "error");
    });
  };

  if (sentencesStatus === "loading" || progressStatus === "loading" || !pendingIds) {
    return <FullScreenLoader />;
  }

  if (sentencesStatus === "error" || !sentences || progressStatus === "error" || !progress) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 py-[60px] text-center">
        <div className="w-full max-w-[380px]">
          <h1 className="mb-2 text-lg font-bold text-white">Couldn&apos;t load the reading test</h1>
          <p className="text-[0.9rem] leading-[1.6] text-text-muted">
            {sentencesError ?? progressError ?? "Please try again."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-10">
      <div className="mx-auto w-full max-w-[640px]">
        <h1 className="mb-2 text-[1.6rem] font-extrabold leading-[1.25] text-white">
          Let&apos;s read some words
        </h1>
        <div className="mb-7 text-[0.9rem] leading-[1.6] text-text-muted">
          <p className="">
            Type the romaji reading for each word below, then press Check to
            see it.
          </p>
        </div>
        <div className="flex flex-col gap-8">
          {sentences.map((sentence, index) => (
            <Fragment key={sentence.id}>
              {index > 0 && <hr className="border-t border-border-soft" />}
              <div
                ref={(el) => {
                  if (el) rowRefs.current.set(sentence.id, el);
                  else rowRefs.current.delete(sentence.id);
                }}
              >
                <ReadingTestSentenceRow
                  sentence={sentence}
                  kanaRomajiMap={kanaRomajiMap}
                  userId={user.id}
                  testType={TEST_TYPE}
                  persisted={progress.get(sentence.id) ?? null}
                  onCheck={handleCheck}
                />
              </div>
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
