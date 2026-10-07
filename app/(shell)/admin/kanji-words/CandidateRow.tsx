"use client";

import { FaRotateLeft } from "react-icons/fa6";
import { renderWordWithFurigana } from "@/lib/study/furigana";
import type { KanjiWordCandidate } from "@/lib/types";
import { algoReason, gapText, gapToneClasses } from "./wordLabels";

function Pill({ className = "border-border-soft bg-white/5 text-text-muted", children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[0.68rem] font-bold ${className}`}>
      {children}
    </span>
  );
}

interface CandidateRowProps {
  candidate: KanjiWordCandidate;
  checked: boolean;
  onToggle: () => void;
  /** Back to what the algorithm chose for this one word, without touching the rest of the list. */
  onRevert: () => void;
}

export function CandidateRow({ candidate: c, checked, onToggle, onRevert }: CandidateRowProps) {
  // Compared with the ALGORITHM, not with what is saved: this is the per-word "edited" state.
  const added = checked && !c.in_algo;
  const removed = !checked && c.in_algo;
  const reason = algoReason(c);

  return (
    <li
      className={`flex items-start gap-3 rounded-xl border p-3 ${
        checked ? "border-accent-blue/30 bg-accent-blue/[0.06]" : "border-border-soft bg-white/[0.02]"
      } ${c.enabled ? "" : "opacity-50"}`}
    >
      <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          disabled={!c.enabled}
          onChange={onToggle}
          className="mt-2.5 h-4 w-4 shrink-0 cursor-pointer accent-accent-blue disabled:cursor-not-allowed"
        />
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="text-[1.5rem] font-bold leading-[1.9]">
              {renderWordWithFurigana(c.word, c.furiganas, "text-[0.7rem] font-normal text-text-muted")}
            </span>
            <span className="text-sm text-text-muted">{c.meanings?.slice(0, 3).join("; ") ?? ""}</span>
          </span>
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            <Pill className={gapToneClasses(c.gap)}>
              {c.jlpt ?? "No level"} {gapText(c.gap)}
            </Pill>
            <Pill>{c.common ? "common" : "not common"}</Pill>
            <Pill>freq {c.freq}</Pill>
            <Pill>group {c.rg}</Pill>
            {c.usually_kana ? <Pill>usually kana</Pill> : null}
            {c.students > 0 ? (
              <Pill className="border-accent-violet/30 bg-accent-violet/10 text-accent-violet">
                {c.students} student{c.students === 1 ? "" : "s"} with a card
              </Pill>
            ) : null}
            {added ? <Pill className="border-accent-green/30 bg-accent-green/10 text-accent-green">added by you</Pill> : null}
            {removed ? <Pill className="border-accent-red/30 bg-accent-red/10 text-accent-red">removed by you</Pill> : null}
          </span>
          {reason ? <span className="mt-1.5 block text-xs leading-snug text-text-muted">{reason}</span> : null}
        </span>
      </label>
      {added || removed ? (
        <button
          type="button"
          onClick={onRevert}
          title="Back to what the algorithm chose for this word"
          aria-label={`Back to the algorithm's choice for ${c.word}`}
          className="mt-1 inline-flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border-soft text-text-muted transition-colors hover:border-white/20 hover:text-white"
        >
          <FaRotateLeft className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </li>
  );
}
