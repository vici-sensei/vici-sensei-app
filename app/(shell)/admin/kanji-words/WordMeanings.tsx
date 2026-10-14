"use client";

import type { KanjiWordCandidate } from "@/lib/types";

export interface WordMeaningsValue {
  short: string | null;
  primary: string[];
  other: string[][];
}

/** A candidate's three kinds of meaning. An RPC older than 20261011040512_kanji_words_admin_meanings.sql only
 *  sends `meanings` (short + primary glued together), which then shows as the primary ones. */
export function candidateMeanings(c: KanjiWordCandidate): WordMeaningsValue {
  if (c.primary === undefined) return { short: null, primary: c.meanings ?? [], other: [] };
  return { short: c.short ?? null, primary: c.primary, other: c.other ?? [] };
}

/** Every meaning of the word, lower-cased, for the editor's search boxes. */
export function meaningsText(m: WordMeaningsValue): string[] {
  return [m.short ?? "", ...m.primary, ...m.other.flat()].map((text) => text.toLowerCase());
}

function Tag({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <abbr
      title={title}
      className="shrink-0 rounded border border-white/15 bg-white/[0.06] px-1 text-[0.6rem] font-extrabold leading-[1.5] text-text-muted no-underline"
    >
      {children}
    </abbr>
  );
}

interface WordMeaningsProps extends WordMeaningsValue {
  className?: string;
}

/**
 * A word's meanings, each kind marked apart: S = the short meaning (a gold pill), P = the primary meanings,
 * 2nd = the secondary senses (muted, one sense after another, separated by "·"). Spans only, so it can sit
 * inside the candidate rows' <label>.
 */
export function WordMeanings({ short, primary, other, className = "" }: WordMeaningsProps) {
  if (!short && primary.length === 0 && other.length === 0) {
    return <span className={`block text-sm text-text-muted ${className}`}>—</span>;
  }
  return (
    <span className={`block text-sm ${className}`}>
      {short || primary.length > 0 ? (
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          {short ? (
            <span className="flex min-w-0 items-baseline gap-1.5">
              <Tag title="Short meaning">S</Tag>
              <span className="rounded-md border border-accent-gold/30 bg-accent-gold/10 px-1.5 font-bold text-accent-gold">
                {short}
              </span>
            </span>
          ) : null}
          {primary.length > 0 ? (
            <span className="flex min-w-0 items-baseline gap-1.5">
              <Tag title="Primary meanings">P</Tag>
              <span className="min-w-0">{primary.join(", ")}</span>
            </span>
          ) : null}
        </span>
      ) : null}
      {other.length > 0 ? (
        <span className="mt-1 flex items-baseline gap-1.5 text-text-muted">
          <Tag title="Secondary meanings">2nd</Tag>
          <span className="min-w-0">{other.map((sense) => sense.join(", ")).join(" · ")}</span>
        </span>
      ) : null}
    </span>
  );
}
