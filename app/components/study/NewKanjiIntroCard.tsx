"use client";

import { useEffect, useRef, useState } from "react";
import type { NewKanjiCandidate } from "@/lib/types";
import { Button } from "@/app/components/ui/Button";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { StudyCardShell } from "./StudyCardShell";
import { CardHeading } from "./CardHeading";
import { InfoChip } from "./InfoChip";
import { WordPreviewRow } from "./WordPreviewRow";

interface Props {
  candidate: NewKanjiCandidate;
  disabled: boolean;
  onConfirm: () => void;
}

// Gentle one-time "peek" scroll to hint the word list is scrollable.
const NUDGE_DISTANCE = 14;
const NUDGE_DURATION = 380;
const NUDGE_DELAY = 450;
const ARROW_SCROLL_DISTANCE = 60;

function easeInOutQuad(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function animateScrollTop(
  el: HTMLElement,
  to: number,
  duration: number,
  isCancelled: () => boolean,
  onDone?: () => void,
) {
  const from = el.scrollTop;
  const start = performance.now();

  function step(now: number) {
    if (isCancelled()) return;
    const t = Math.min(1, (now - start) / duration);
    el.scrollTop = from + (to - from) * easeInOutQuad(t);
    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      onDone?.();
    }
  }

  requestAnimationFrame(step);
}

export function NewKanjiIntroCard({ candidate, disabled, onConfirm }: Props) {
  const words = candidate.words;
  const listRef = useRef<HTMLDivElement>(null);
  const [showFade, setShowFade] = useState(false);
  const [isScrollable, setIsScrollable] = useState(false);
  const [hasScrolledToBottom, setHasScrolledToBottom] = useState(false);
  const nextDisabled = disabled || (isScrollable && !hasScrolledToBottom);

  useEffect(() => {
    if (nextDisabled) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Enter") {
        event.preventDefault();
        onConfirm();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [nextDisabled, onConfirm]);

  useEffect(() => {
    if (!isScrollable) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
      const el = listRef.current;
      if (!el) return;
      event.preventDefault();
      el.scrollBy({ top: event.key === "ArrowDown" ? ARROW_SCROLL_DISTANCE : -ARROW_SCROLL_DISTANCE, behavior: "smooth" });
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isScrollable]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;

    const updateFade = () => {
      const scrollable = el.scrollHeight - el.clientHeight > 1;
      const atBottom = el.scrollHeight - el.clientHeight - el.scrollTop <= 1;
      setShowFade(scrollable && !atBottom);
      setIsScrollable(scrollable);
      if (atBottom) setHasScrolledToBottom(true);
    };

    const observer = new ResizeObserver(updateFade);
    observer.observe(el);
    el.addEventListener("scroll", updateFade);
    updateFade();

    let cancelled = false;
    let userScrolled = false;
    const markUserScrolled = () => {
      userScrolled = true;
    };
    el.addEventListener("wheel", markUserScrolled, { passive: true });
    el.addEventListener("touchstart", markUserScrolled, { passive: true });

    const nudgeTimeout = window.setTimeout(() => {
      if (cancelled || userScrolled || el.scrollHeight - el.clientHeight <= 1) return;
      animateScrollTop(
        el,
        NUDGE_DISTANCE,
        NUDGE_DURATION,
        () => cancelled || userScrolled,
        () => {
          if (cancelled || userScrolled) return;
          animateScrollTop(el, 0, NUDGE_DURATION, () => cancelled);
        },
      );
    }, NUDGE_DELAY);

    return () => {
      cancelled = true;
      observer.disconnect();
      el.removeEventListener("scroll", updateFade);
      el.removeEventListener("wheel", markUserScrolled);
      el.removeEventListener("touchstart", markUserScrolled);
      window.clearTimeout(nudgeTimeout);
    };
  }, []);

  return (
    <StudyCardShell
      label="New kanji"
      accent="gold"
      size="lg"
      layout="column"
      cornerBadge={
        candidate.level && (
          <LevelBadge level={candidate.level} size="lg" className="absolute right-2 top-2 z-10" />
        )
      }
    >
      <div className="shrink-0">
        <CardHeading>{candidate.kanji}</CardHeading>

        <div className="mb-2 text-[1.3rem] font-bold text-white">{candidate.meanings?.join(", ")}</div>

        <div className="flex flex-wrap justify-center gap-2">
          {candidate.kun_readings && candidate.kun_readings.length > 0 && (
            <InfoChip>
              Kun: <b>{candidate.kun_readings.join("、")}</b>
            </InfoChip>
          )}
          {candidate.on_readings && candidate.on_readings.length > 0 && (
            <InfoChip>
              On: <b>{candidate.on_readings.join("、")}</b>
            </InfoChip>
          )}
        </div>
      </div>

      {words.length > 0 && (
        <div className="relative mt-4 min-h-[130px]">
          <div
            ref={listRef}
            className="h-full max-h-full overflow-y-auto divide-y divide-border-soft rounded-xl border border-border-soft bg-white/[0.03] text-left"
          >
            {words.map((w) => (
              <WordPreviewRow key={w.id} vocabulary={w.vocabulary} />
            ))}
          </div>
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-x-0 bottom-0 h-16 rounded-b-xl bg-gradient-to-t from-[#111827] to-transparent transition-opacity duration-400 ease-out ${
              showFade ? "opacity-100" : "opacity-0"
            }`}
          />
        </div>
      )}
      <div className="mt-4 shrink-0">
        <Button className="w-full" disabled={nextDisabled} onClick={onConfirm}>
          Next
        </Button>
      </div>
    </StudyCardShell>
  );
}
