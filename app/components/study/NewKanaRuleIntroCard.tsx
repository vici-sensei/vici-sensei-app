"use client";

import { useEffect } from "react";
import type { NewHiraganaRuleCandidate, NewKatakanaRuleCandidate } from "@/lib/types";
import { renderKanaRuleNotes } from "@/lib/study/kanaRuleNotes";
import { groupByGojuonRow, resolveRuleExampleRowLabel } from "@/lib/srs/gojuon";
import { Button } from "@/app/components/ui/Button";
import { StudyCardShell } from "./StudyCardShell";
import { CardHeading } from "./CardHeading";
import { useScrollHint } from "./useScrollHint";

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
 * The notes text and the example grid are each their own bounded, independently-scrollable box
 * (useScrollHint, shared with NewKanjiIntroCard's word list) -- "Next" stays disabled until
 * whichever of them overflows has been scrolled all the way down. A rule with no notes/no
 * examples (seion/dakuten/handakuten strip examples down to 0 -- see
 * 20260905_kana_rule_examples_only.sql) never renders that box, so it can't contribute to the
 * gating. */
export function NewKanaRuleIntroCard({ candidate, script, disabled, onConfirm }: Props) {
  const examples = candidate.examples;
  const {
    ref: notesRef,
    showFade: notesShowFade,
    isScrollable: notesScrollable,
    hasScrolledToBottom: notesScrolledToBottom,
  } = useScrollHint<HTMLDivElement>();
  const {
    ref: examplesRef,
    showFade: examplesShowFade,
    isScrollable: examplesScrollable,
    hasScrolledToBottom: examplesScrolledToBottom,
  } = useScrollHint<HTMLDivElement>();
  const nextDisabled =
    disabled || (notesScrollable && !notesScrolledToBottom) || (examplesScrollable && !examplesScrolledToBottom);

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
      </div>

      {candidate.notes && (
        <div className="relative mt-2 min-h-[60px]">
          <div ref={notesRef} className="max-h-full overflow-y-auto text-left">
            <p className="text-[0.9rem] leading-relaxed text-text-muted whitespace-pre-line">
              {renderKanaRuleNotes(candidate.notes)}
            </p>
          </div>
          <div
            aria-hidden
            className={`pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-[#111827] to-transparent transition-opacity duration-400 ease-out ${
              notesShowFade ? "opacity-100" : "opacity-0"
            }`}
          />
        </div>
      )}

      {examples.length > 0 && (
        <div className="relative mt-4 min-h-[130px]">
          <div
            ref={examplesRef}
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
              examplesShowFade ? "opacity-100" : "opacity-0"
            }`}
          />
        </div>
      )}

      <div className="mt-4 shrink-0">
        <Button className="min-w-[min(220px,100%)]" disabled={nextDisabled} onClick={onConfirm}>
          Next
        </Button>
      </div>
    </StudyCardShell>
  );
}
