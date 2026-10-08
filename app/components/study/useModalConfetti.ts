"use client";

import { useEffect, useRef } from "react";
import { celebrate, stopCelebration } from "@/lib/confetti";

/** Confetti for a celebration modal (JlptLevelUpModal, KanaGraduationModal): fires once when the
 * modal opens, as soon as `ready` is true. `ready` goes false while a new-badge modal is open over
 * it (its sakura petals shouldn't compete with confetti) -- if the confetti had already started by
 * then it's cut off, and it starts over once `ready` is true again. That interrupt-and-restart is
 * what covers a badge that shows up a beat after the modal does (useStudyQueue sets the badge
 * after RATING_PACING_MS, the level-up check can resolve before that). A confetti that ran its
 * full course before the badge arrived isn't replayed. Closing the modal itself doesn't stop the
 * confetti -- it keeps falling over the page behind, as it always has. */
export function useModalConfetti(ready: boolean) {
  const startedRef = useRef(false);
  const interruptedRef = useRef(false);

  useEffect(() => {
    if (!ready) {
      if (startedRef.current && stopCelebration()) interruptedRef.current = true;
      return;
    }
    if (startedRef.current && !interruptedRef.current) return;
    startedRef.current = true;
    interruptedRef.current = false;
    void celebrate();
  }, [ready]);
}
