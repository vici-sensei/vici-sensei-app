"use client";

import {
  useEffect,
  useRef,
  useState,
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { checkKanaReadingAnswer } from "@/lib/study/kanaReadingMatch";
import { ACCENT_FOCUS_BORDER_CLASSES } from "@/lib/study/accent";
import type { ReadingTestSentence } from "@/lib/types";

/** How long to let the student stop typing before mirroring the draft server-side -- frequent
 * enough that switching device/tab mid-word rarely loses more than the last syllable, without
 * firing a request on every keystroke. */
const DRAFT_SAVE_DEBOUNCE_MS = 800;

interface Props {
  sentence: ReadingTestSentence;
  /** Server-mirrored draft for this exact sentence (see user_reading_test_attempts'
   * draft_sentence_id/draft_answer) -- "" if there was none, e.g. a fresh question or one whose
   * draft belongs to a different sentence. */
  initialDraft: string;
  /** Fired once Check finds this correct/incorrect -- the caller persists it (see
   * user_reading_test_progress), which is what makes ReadingTestPage swap this form out for the
   * Next button on the next render. */
  onCheck: (sentenceId: number, correct: boolean, userAnswer: string) => void;
  /** Debounced (see DRAFT_SAVE_DEBOUNCE_MS) mirror of the input as the student types, so it
   * survives a refresh/tab switch/device change while this question is still pending. */
  onDraftChange: (sentenceId: number, value: string) => void;
  /** Fired the instant Check succeeds, ahead of any pending debounce -- the typed text just became
   * a real answer, so the draft copy of it is stale. */
  onDraftClear: (sentenceId: number) => void;
  /** The sibling ReadingTestSentenceRow's placeholder (its original spot, right after the
   * sentence) -- where the input is portaled to whenever the on-screen keyboard is closed. */
  topSlot: HTMLDivElement | null;
  /** Whether the on-screen keyboard is currently open (see useKeyboardOpen) -- while it is, the
   * input is portaled next to the Check button instead of topSlot, since topSlot's position may
   * well be scrolled out of view/under the keyboard by then. */
  keyboardOpen: boolean;
}

/** The romaji input + Check button for one reading-test question. The Check button always renders
 * where ReadingTestPage places this component (near its own Next button); the input itself is a
 * single DOM node portaled either into `topSlot` (closed keyboard -- sits with the sentence, its
 * original spot) or into a slot right before the button (open keyboard). Using one portaled node
 * rather than swapping between two rendered inputs matters here: relocating the SAME node preserves
 * focus, so the reposition doesn't itself blur the input and dismiss the very keyboard that
 * triggered it. ReadingTestPage mounts this only while the question is still unanswered
 * (key={sentence.id}), which is what makes autoFocus below "just work" on every new question, and
 * unmounts it the instant Check succeeds in favor of its own Next button. */
export function ReadingTestAnswerForm({
  sentence,
  initialDraft,
  onCheck,
  onDraftChange,
  onDraftClear,
  topSlot,
  keyboardOpen,
}: Props) {
  const [answer, setAnswer] = useState(initialDraft);
  const [bottomSlot, setBottomSlot] = useState<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const draftTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Guards against a double Check -- e.g. a fast repeat Enter press landing before the parent's
  // progress update unmounts this form -- since onCheck firing twice would submit the same answer
  // twice.
  const submittedRef = useRef(false);

  // Cancels a pending debounced save when this question unmounts (e.g. Check succeeds before it
  // fired) so it can't land after the form for a different sentence has already replaced this one.
  useEffect(() => {
    return () => {
      if (draftTimeoutRef.current) clearTimeout(draftTimeoutRef.current);
    };
  }, []);

  const handleAnswerChange = (value: string) => {
    setAnswer(value);
    if (draftTimeoutRef.current) clearTimeout(draftTimeoutRef.current);
    draftTimeoutRef.current = setTimeout(
      () => onDraftChange(sentence.id, value),
      DRAFT_SAVE_DEBOUNCE_MS,
    );
  };

  const handleCheck = (event: FormEvent) => {
    event.preventDefault();
    if (!answer.trim() || submittedRef.current) return;
    submittedRef.current = true;
    const checked = checkKanaReadingAnswer(answer, sentence.romaji);
    if (draftTimeoutRef.current) clearTimeout(draftTimeoutRef.current);
    onDraftClear(sentence.id);
    onCheck(sentence.id, checked.correct, answer);
    // Closes the on-screen keyboard on mobile -- pressing the keyboard's own Enter/Go key submits
    // the form but doesn't blur the input on its own, so the keyboard would otherwise stay open
    // covering the just-revealed result.
    inputRef.current?.blur();
  };

  // Anti-cheat, same as AnswerForm: block pasting an answer in, and block copying the question
  // out, while it's still unanswered.
  const preventClipboardBypass = (
    event: ClipboardEvent<HTMLInputElement> | DragEvent<HTMLInputElement>,
  ) => {
    event.preventDefault();
  };

  // Stable per-question, not per-render -- ties the portaled input back to this form via the HTML
  // `form` attribute, which associates a field with a <form> anywhere in the document regardless of
  // DOM nesting. Needed because the input itself lives outside this form's subtree whenever it's
  // portaled into topSlot.
  const formId = `reading-answer-form-${sentence.id}`;

  const input = (
    <input
      ref={inputRef}
      form={formId}
      type="text"
      value={answer}
      onChange={(e) => handleAnswerChange(e.target.value)}
      onPaste={preventClipboardBypass}
      onCopy={preventClipboardBypass}
      onCut={preventClipboardBypass}
      onDrop={preventClipboardBypass}
      onContextMenu={(e) => e.preventDefault()}
      placeholder="Type the reading…"
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      autoFocus
      className={`w-full select-none no-touch-callout rounded-lg border border-border-soft bg-white/[0.03] px-3.5 py-3 text-[0.95rem] text-white outline-none transition-colors ${ACCENT_FOCUS_BORDER_CLASSES.violet}`}
    />
  );
  const portalTarget = keyboardOpen ? bottomSlot : topSlot;

  return (
    <>
      <form id={formId} onSubmit={handleCheck} className="flex flex-row gap-2 w-full items-center justify-center">
        <div ref={setBottomSlot} className={keyboardOpen ? "flex-1" : "hidden"} />
        <button
          type="submit"
          disabled={!answer.trim()}
          className="shrink-0 cursor-pointer rounded-lg border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-bold text-white outline-none transition-colors enabled:hover:border-white/20 enabled:hover:bg-white/[0.07] enabled:focus-visible:border-white/20 disabled:cursor-not-allowed disabled:opacity-45"
        >
          Check
        </button>
      </form>
      {portalTarget && createPortal(input, portalTarget)}
    </>
  );
}
