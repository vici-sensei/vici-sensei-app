"use client";

import type { ReactNode } from "react";
import {
  KANJI_LEVELS,
  type ChangedFilter,
  type CountBucket,
  type GapFilter,
  type KanjiFilters,
  type RecentFilter,
  type ReviewFilter,
  type WordKind,
} from "./kanjiWordsView";

const GAP_OPTIONS: { value: GapFilter; label: string }[] = [
  { value: 0, label: "Any" },
  { value: 1, label: "1+ levels above" },
  { value: 2, label: "2+ levels above" },
  { value: 3, label: "3+ levels above" },
];

const COUNT_OPTIONS: { value: CountBucket; label: string }[] = [
  { value: "0", label: "None" },
  { value: "1", label: "1 word" },
  { value: "2", label: "2 words" },
  { value: "3", label: "3 words" },
  { value: "4plus", label: "4+" },
  { value: "over5", label: "Over 5" },
];

const KIND_OPTIONS: { value: WordKind; label: string }[] = [
  { value: "nolevel", label: "Without a JLPT level" },
  { value: "uncommon", label: "Not common" },
];

const CHANGED_OPTIONS: { value: ChangedFilter; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "modified", label: "Edited by an admin" },
  { value: "untouched", label: "Same as the algorithm" },
  { value: "gained", label: "Got a word" },
  { value: "lost", label: "Lost a word" },
];

const REVIEW_OPTIONS: { value: ReviewFilter; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "reviewed", label: "Reviewed" },
  { value: "unreviewed", label: "Not reviewed" },
  { value: "recheck", label: "Algorithm changed" },
];

const RECENT_OPTIONS: { value: RecentFilter; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "1d", label: "Last 24 hours" },
  { value: "7d", label: "Last 7 days" },
];

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={`cursor-pointer rounded-lg border px-3 py-1.5 text-[0.8rem] font-bold transition-all ${
        active
          ? "border-accent-blue/35 bg-accent-blue/[0.12] text-accent-blue"
          : "border-border-soft bg-white/[0.03] text-text-muted hover:border-white/20"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Group({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-[0.7rem] font-extrabold uppercase tracking-[1px] text-text-muted">{label}</legend>
      <div className="flex flex-wrap gap-1.5">{children}</div>
      {hint ? <p className="mt-1.5 text-[0.72rem] leading-snug text-text-muted">{hint}</p> : null}
    </fieldset>
  );
}

/** Pick one; the first option is how it's cleared. */
function SingleChoice<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return options.map((option) => (
    <Chip key={option.value} active={value === option.value} onClick={() => onChange(option.value)}>
      {option.label}
    </Chip>
  ));
}

/** Pick any number; none picked = no filter. */
function MultiChoice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T[];
  onChange: (value: T[]) => void;
}) {
  return options.map((option) => {
    const active = value.includes(option.value);
    return (
      <Chip
        key={option.value}
        active={active}
        onClick={() => onChange(active ? value.filter((v) => v !== option.value) : [...value, option.value])}
      >
        {option.label}
      </Chip>
    );
  });
}

interface FilterPanelProps {
  filters: KanjiFilters;
  onChange: (patch: Partial<KanjiFilters>) => void;
  /** Emails of the admins who changed something, for the "Changed by" group. */
  adminOptions: string[];
}

export function FilterPanel({ filters, onChange, adminOptions }: FilterPanelProps) {
  return (
    <div className="grid gap-x-8 gap-y-5 md:grid-cols-2">
      <Group
        label="Judge the lists on"
        hint="The filters below about words look at this list. Switch it to see what the algorithm alone would give."
      >
        <SingleChoice
          options={[
            { value: "current", label: "Current list" },
            { value: "algo", label: "Algorithm's list" },
          ]}
          value={filters.onAlgo ? "algo" : "current"}
          onChange={(v) => onChange({ onAlgo: v === "algo" })}
        />
      </Group>

      <Group
        label="Word level vs kanji level"
        hint="At least one word that many levels above the kanji's own. A word with no JLPT level counts as beyond N1, as in the algorithm, so an N1 kanji never reaches 2+."
      >
        <SingleChoice options={GAP_OPTIONS} value={filters.gap} onChange={(gap) => onChange({ gap })} />
      </Group>

      <Group label="Kanji level">
        <MultiChoice
          options={KANJI_LEVELS.map((level) => ({ value: level, label: level }))}
          value={filters.levels}
          onChange={(levels) => onChange({ levels })}
        />
      </Group>

      <Group label="Number of words">
        <MultiChoice options={COUNT_OPTIONS} value={filters.counts} onChange={(counts) => onChange({ counts })} />
      </Group>

      <Group label="Has words that are">
        <MultiChoice options={KIND_OPTIONS} value={filters.wordKinds} onChange={(wordKinds) => onChange({ wordKinds })} />
      </Group>

      <Group label="Compared to the algorithm">
        <SingleChoice options={CHANGED_OPTIONS} value={filters.changed} onChange={(changed) => onChange({ changed })} />
      </Group>

      <Group label="Review">
        <SingleChoice options={REVIEW_OPTIONS} value={filters.review} onChange={(review) => onChange({ review })} />
      </Group>

      <Group label="Last changed">
        <SingleChoice options={RECENT_OPTIONS} value={filters.recent} onChange={(recent) => onChange({ recent })} />
      </Group>

      {adminOptions.length > 0 ? (
        <Group label="Last changed by">
          <MultiChoice
            options={adminOptions.map((email) => ({ value: email, label: email }))}
            value={filters.admins}
            onChange={(admins) => onChange({ admins })}
          />
        </Group>
      ) : null}
    </div>
  );
}
