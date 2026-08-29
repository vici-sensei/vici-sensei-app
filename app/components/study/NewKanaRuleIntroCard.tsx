"use client";

import { useEffect, useRef, useState } from "react";
import type { NewHiraganaRuleCandidate, NewKatakanaRuleCandidate } from "@/lib/types";
import { renderKanaRuleNotes } from "@/lib/study/kanaRuleNotes";
import { groupByGojuonRow, resolveRuleExampleRowLabel } from "@/lib/srs/gojuon";
import { Button } from "@/app/components/ui/Button";
import { StudyCardShell } from "./StudyCardShell";
import { CardHeading } from "./CardHeading";

interface Props {
  candidate: NewHiraganaRuleCandidate | NewKatakanaRuleCandidate;
  /** Which set this candidate is from -- drives the card label only. */
  script: "hiragana" | "katakana";
  disabled: boolean;
  onConfirm: () => void;
}

// Gentle one-time "peek" scroll to hint the example grid is scrollable -- same tuning as
// NewKanjiIntroCard's word list, so the two intro-card types feel identical.
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

/** One-time, read-only "new_rule" intro card (entry_kind = 'rule' rows -- dakuten, sokuon, yoon,
 * ...): no typing, no grading -- "Next" just marks it permanently seen (see
 * introduce_hiragana_rule/introduce_katakana_rule, 20260904_kana_rule_cards.sql) and it never
 * comes back. Mirrors Browse's RuleCard + example grid (BrowseKanaListPage.tsx) as one "lesson",
 * including the same per-family sub-grouping of the example grid (groupByGojuonRow/
 * resolveRuleExampleRowLabel, lib/srs/gojuon.ts), fed by the `gojuon_row` each example carries
 * (20260906_kana_rule_examples_gojuon_row.sql).
 *
 * The example grid's scroll/gating behavior is a direct port of NewKanjiIntroCard's word list
 * (same constants, same nudge/fade/arrow-key logic) -- notes stays fixed up top, only the grid
 * scrolls in its own bounded box, and "Next" stays disabled until the student has scrolled it all
 * the way down. A rule with no examples (seion/dakuten/handakuten strip down to 0 -- see
 * 20260905_kana_rule_examples_only.sql) never renders the box at all, so nextDisabled reduces to
 * just the caller's own `disabled` for those. */
export function NewKanaRuleIntroCard({ candidate, script, disabled, onConfirm }: Props) {
  const examples = candidate.examples;
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
    <StudyCardShell label={`New ${script} rule`} accent="gold" size="lg" layout="column">
      <div className="shrink-0">
        <CardHeading>{candidate.character}</CardHeading>
        {candidate.label && (
          <div className="mb-2 text-[1.05rem] font-bold text-white">
            {candidate.label}
            {candidate.technical_term && (
              <span className="ml-1.5 text-[0.75rem] font-normal text-text-muted/70">({candidate.technical_term})</span>
            )}
          </div>
        )}
        {candidate.notes && (
          <p className="text-left text-[0.9rem] leading-relaxed text-text-muted whitespace-pre-line">
            {renderKanaRuleNotes(candidate.notes)}
          </p>
        )}
      </div>

      {examples.length > 0 && (
        <div className="relative mt-4 min-h-[130px]">
          <div
            ref={listRef}
            className="h-full max-h-full overflow-y-auto rounded-xl border border-border-soft bg-white/[0.03] p-3"
          >
            <div className="flex flex-col gap-3">
              {groupByGojuonRow(examples).map(([gojuonRow, groupExamples]) => (
                <div key={gojuonRow}>
                  <div className="mb-1.5 text-center text-[0.7rem] font-extrabold uppercase tracking-[1.2px] text-text-muted">
                    {resolveRuleExampleRowLabel(gojuonRow)}
                  </div>
                  <div className="flex flex-wrap justify-center gap-2">
                    {groupExamples.map((example, i) => (
                      <div
                        key={`${example.character}-${i}`}
                        className="flex min-w-[64px] flex-col items-center gap-0.5 rounded-xl border border-border-soft bg-white/[0.03] px-3 py-2"
                      >
                        <div className="text-xl text-white">{example.character}</div>
                        <div className="text-[0.75rem] font-semibold text-text-muted">{example.romaji}</div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
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
