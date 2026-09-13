"use client";

import { useEffect, useRef, useState } from "react";
import type { KanaRuleExample, NewHiraganaRuleCandidate, NewKatakanaRuleCandidate } from "@/lib/types";
import { renderKanaRuleNotes } from "@/lib/study/kanaRuleNotes";
import { groupByGojuonRow, resolveRuleExampleRowLabel, splitYoonCharacter } from "@/lib/srs/gojuon";
import { Button } from "@/app/components/ui/Button";
import { StudyCardShell } from "./StudyCardShell";
import { CardHeading } from "./CardHeading";
import { useScrollHint } from "./useScrollHint";

/** A yōon example (きゃ, シュ, ...) shown as its two components: "き ki + ゃ ya = きゃ kya" --
 * wraps onto multiple lines on narrow phone widths (three groups plus two connectors don't fit
 * one row there) instead of forcing a full column stack, so it still reads left-to-right in
 * whatever chunks fit. Falls back to the plain character/romaji tile if `example.character` isn't
 * a recognized two-character digraph. */
function YoonExampleTile({ example }: { example: KanaRuleExample }) {
  const parts = splitYoonCharacter(example.character);
  if (!parts) {
    return (
      <div className="flex min-w-[64px] flex-col items-center gap-0.5 rounded-xl border border-border-soft bg-white/[0.03] px-3 py-2">
        <div className="text-xl text-white">{example.character}</div>
        <div className="text-[0.75rem] font-semibold text-text-muted">{example.romaji}</div>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center justify-center gap-1.5 rounded-xl border border-border-soft bg-white/[0.03] px-3 py-2">
      <div className="flex flex-col items-center">
        <div className="text-xl text-white">{parts.base}</div>
        <div className="text-[0.7rem] font-semibold text-text-muted">{parts.baseRomaji}</div>
      </div>
      <span className="text-sm font-bold text-text-muted">+</span>
      <div className="flex flex-col items-center">
        <div className="text-xl text-white">{parts.small}</div>
        <div className="text-[0.7rem] font-semibold text-text-muted">{parts.smallRomaji}</div>
      </div>
      <span className="text-sm font-bold text-text-muted">=</span>
      <div className="flex flex-col items-center">
        <div className="text-xl text-white">{example.character}</div>
        <div className="text-[0.7rem] font-semibold text-white">{example.romaji}</div>
      </div>
    </div>
  );
}

/** Step 1's rule-text box -- its own component (rather than a branch inline in
 * NewKanaRuleIntroCard) so switching steps unmounts/remounts it, giving it a fresh useScrollHint
 * instance each time instead of reusing one whose ResizeObserver was set up while this box didn't
 * exist yet (mounting only on the active step, rather than always-mounted-but-hidden, sidesteps
 * ResizeObserver's unreliable firing when a display:none box becomes visible again). Reports its
 * own scroll-gating state up via onGatingChange since Next's disabled state lives one level up. */
function RuleNotesBox({ notes, onGatingChange }: { notes: string; onGatingChange: (disabled: boolean) => void }) {
  const { ref, showFade, isScrollable, hasScrolledToBottom } = useScrollHint<HTMLDivElement>();

  useEffect(() => {
    onGatingChange(isScrollable && !hasScrolledToBottom);
  }, [isScrollable, hasScrolledToBottom, onGatingChange]);

  return (
    <div className="relative mt-2 min-h-[96px] max-h-fit">
      <div ref={ref} className="max-h-full overflow-y-auto text-left">
        <p className="text-[0.9rem] leading-relaxed text-text-muted whitespace-pre-line">{renderKanaRuleNotes(notes)}</p>
      </div>
      <div
        aria-hidden
        className={`pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#111827] to-transparent transition-opacity duration-400 ease-out ${
          showFade ? "opacity-100" : "opacity-0"
        }`}
      />
    </div>
  );
}

/** Step 2's example-grid box -- same "own component, fresh per step" reasoning as RuleNotesBox
 * above. Since it fully unmounts on leaving step 2 (see NewKanaRuleIntroCard), each fresh mount's
 * own useScrollHint starts from scratch -- scrollTop back at 0 and hasScrolledToBottom back at
 * false -- so both round-trip through refs the parent holds across the unmount:
 * initialScrollTop/onScrollTopChange put the student back where they left off, and
 * initialEverScrolledToBottom/onEverScrolledToBottomChange keep "Next" enabled once they've
 * reached the bottom at least once, even if they then scrolled back up before hitting "Back". */
function RuleExamplesBox({
  examples,
  kanaType,
  onGatingChange,
  initialScrollTop,
  onScrollTopChange,
  initialEverScrolledToBottom,
  onEverScrolledToBottomChange,
}: {
  examples: KanaRuleExample[];
  kanaType: string;
  onGatingChange: (disabled: boolean) => void;
  initialScrollTop: number;
  onScrollTopChange: (top: number) => void;
  initialEverScrolledToBottom: boolean;
  onEverScrolledToBottomChange: () => void;
}) {
  const { ref, showFade, isScrollable, hasScrolledToBottom } = useScrollHint<HTMLDivElement>(initialScrollTop > 0);
  const everScrolledToBottom = hasScrolledToBottom || initialEverScrolledToBottom;

  useEffect(() => {
    onGatingChange(isScrollable && !everScrolledToBottom);
  }, [isScrollable, everScrolledToBottom, onGatingChange]);

  useEffect(() => {
    if (hasScrolledToBottom) onEverScrolledToBottomChange();
  }, [hasScrolledToBottom, onEverScrolledToBottomChange]);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = initialScrollTop;
    // Restore once, right after mount -- not meant to react to initialScrollTop changing again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative mt-4 min-h-[130px] max-h-fit">
      <div
        ref={ref}
        onScroll={(event) => onScrollTopChange(event.currentTarget.scrollTop)}
        className="h-full max-h-full overflow-y-auto rounded-xl border border-border-soft bg-white/[0.03] p-3"
      >
        <div className="flex flex-col gap-3">
          {groupByGojuonRow(examples).map(([gojuonRow, groupExamples]) => (
            <div key={gojuonRow}>
              <div className="mb-1.5 text-center text-[0.7rem] font-extrabold uppercase tracking-[1.2px] text-text-muted">
                {resolveRuleExampleRowLabel(gojuonRow)}
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                {groupExamples.map((example, i) =>
                  kanaType === "yoon" ? (
                    <YoonExampleTile key={`${example.character}-${i}`} example={example} />
                  ) : (
                    <div
                      key={`${example.character}-${i}`}
                      className="flex min-w-[64px] flex-col items-center gap-0.5 rounded-xl border border-border-soft bg-white/[0.03] px-3 py-2"
                    >
                      <div className="text-xl text-white">{example.character}</div>
                      <div className="text-[0.75rem] font-semibold text-text-muted">{example.romaji}</div>
                    </div>
                  )
                )}
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
  );
}

interface Props {
  candidate: NewHiraganaRuleCandidate | NewKatakanaRuleCandidate;
  /** Which set this candidate is from -- drives the card label only. */
  script: "hiragana" | "katakana";
  disabled: boolean;
  onConfirm: () => void;
}

/** One-time, read-only "new_rule" intro card (entry_kind = 'rule' rows -- dakuten, sokuon, yoon,
 * ...): no typing, no grading -- "Next" just marks it permanently seen (see
 * introduce_hiragana_rule/introduce_katakana_rule, 20260904_kana_rule_cards.sql) and it never
 * comes back. Mirrors Browse's RuleCard + example grid (BrowseKanaListPage.tsx) as one "lesson",
 * including the same per-family sub-grouping of the example grid (groupByGojuonRow/
 * resolveRuleExampleRowLabel, lib/srs/gojuon.ts), fed by the `gojuon_row` each example carries
 * (20260906_kana_rule_examples_gojuon_row.sql).
 *
 * The rule text itself pages one blank-line-separated paragraph at a time (`notes.split` on a
 * blank line -- the same convention renderKanaRuleNotes' whitespace-pre-line already relies on),
 * so a longer rule (like the seion intro's "what is hiragana/katakana" -- three paragraphs) reads
 * as several short screens instead of one tall scrolling block. A rule with examples (sokuon/
 * yoon/n_gemination/choonpu/extended) appends one more step -- the example grid (RuleExamplesBox)
 * -- after every notes paragraph. Every step gets a "Back" button, disabled on the first step
 * since there's nothing before it to go back to; Back only moves locally within this card and
 * never re-touches the server. A rule whose notes are a single paragraph and has no examples
 * (dakuten/handakuten) collapses to one step, with no Step counter and no Back button, same as
 * before this paragraph-paging was added. */
export function NewKanaRuleIntroCard({ candidate, script, disabled, onConfirm }: Props) {
  const examples = candidate.examples;
  const hasExamples = examples.length > 0;
  // Split on a blank line -- the same paragraph convention the notes column already uses (see
  // 20260829_rule_notes_paragraphs_and_bold.sql) -- so a multi-paragraph rule pages one paragraph
  // per step instead of cramming them all into one scrolling box.
  const notesParagraphs = candidate.notes ? candidate.notes.split(/\n\s*\n/) : [];
  const totalSteps = notesParagraphs.length + (hasExamples ? 1 : 0);
  const [step, setStep] = useState(1);
  const [gateDisabled, setGateDisabled] = useState(false);
  const nextDisabled = disabled || gateDisabled;
  const isExamplesStep = hasExamples && step === totalSteps;
  // Survive RuleExamplesBox unmounting on "Back" -- see its own doc comment.
  const examplesScrollTopRef = useRef(0);
  const examplesEverScrolledToBottomRef = useRef(false);

  const goBack = () => {
    if (step === 1) return;
    setGateDisabled(true);
    setStep((s) => s - 1);
  };

  const goNext = () => {
    if (step < totalSteps) {
      setGateDisabled(true);
      setStep((s) => s + 1);
    } else {
      onConfirm();
    }
  };

  useEffect(() => {
    if (nextDisabled) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Enter") {
        event.preventDefault();
        goNext();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextDisabled, step, totalSteps]);

  return (
    <StudyCardShell
      label={totalSteps > 1 ? `New ${script} rule · Step ${step} of ${totalSteps}` : `New ${script} rule`}
      accent="gold"
      size="lg"
      layout="column"
    >
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
      </div>

      {!isExamplesStep && notesParagraphs.length > 0 && (
        <RuleNotesBox key={step} notes={notesParagraphs[step - 1]} onGatingChange={setGateDisabled} />
      )}

      {isExamplesStep && (
        <RuleExamplesBox
          examples={examples}
          kanaType={candidate.kana_type}
          onGatingChange={setGateDisabled}
          initialScrollTop={examplesScrollTopRef.current}
          onScrollTopChange={(top) => {
            examplesScrollTopRef.current = top;
          }}
          initialEverScrolledToBottom={examplesEverScrolledToBottomRef.current}
          onEverScrolledToBottomChange={() => {
            examplesEverScrolledToBottomRef.current = true;
          }}
        />
      )}

      {totalSteps > 1 ? (
        <div className="mt-4 flex shrink-0 justify-center gap-3">
          <Button variant="secondary" disabled={step === 1} onClick={goBack}>
            Back
          </Button>
          <Button className="w-fit" disabled={nextDisabled} onClick={goNext}>
            Next
          </Button>
        </div>
      ) : (
        <div className="mt-4 shrink-0">
          <Button className="w-fit" disabled={nextDisabled} onClick={onConfirm}>
            Next
          </Button>
        </div>
      )}
    </StudyCardShell>
  );
}
