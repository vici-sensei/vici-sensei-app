"use client";

import type { ReactNode } from "react";
import type { LevelFilter, WordFilters, YesNoFilter } from "./wordsView";

const LEVEL_OPTIONS: { value: LevelFilter; label: string }[] = [
  { value: "N5", label: "N5" },
  { value: "N4", label: "N4" },
  { value: "N3", label: "N3" },
  { value: "N2", label: "N2" },
  { value: "N1", label: "N1" },
  { value: "none", label: "No level" },
];

function yesNoOptions(yes: string, no: string): { value: YesNoFilter; label: string }[] {
  return [
    { value: "any", label: "Any" },
    { value: "yes", label: yes },
    { value: "no", label: no },
  ];
}

const STUDY_OPTIONS = yesNoOptions("Enabled", "Disabled");
const COMMON_OPTIONS = yesNoOptions("Common", "Not common");
const USUALLY_KANA_OPTIONS = yesNoOptions("Yes", "No");
const SHORT_MEANING_OPTIONS = yesNoOptions("Has one", "None");

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

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-2 text-[0.7rem] font-extrabold uppercase tracking-[1px] text-text-muted">{label}</legend>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </fieldset>
  );
}

/** Pick one; the "any" option is how it's cleared. */
function SingleChoice<T extends string>({
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
        onClick={() =>
          // Rebuilt from `options` so the order in the URL doesn't depend on click order.
          onChange(options.map((o) => o.value).filter((v) => (v === option.value ? !active : value.includes(v))))
        }
      >
        {option.label}
      </Chip>
    );
  });
}

export function FilterPanel({
  filters,
  onChange,
}: {
  filters: WordFilters;
  onChange: (patch: Partial<WordFilters>) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
      <Group label="JLPT level">
        <MultiChoice options={LEVEL_OPTIONS} value={filters.levels} onChange={(levels) => onChange({ levels })} />
      </Group>
      <Group label="Study">
        <SingleChoice options={STUDY_OPTIONS} value={filters.study} onChange={(study) => onChange({ study })} />
      </Group>
      <Group label="Common (Jisho)">
        <SingleChoice options={COMMON_OPTIONS} value={filters.common} onChange={(common) => onChange({ common })} />
      </Group>
      <Group label="Usually written in kana">
        <SingleChoice
          options={USUALLY_KANA_OPTIONS}
          value={filters.usuallyKana}
          onChange={(usuallyKana) => onChange({ usuallyKana })}
        />
      </Group>
      <Group label="Short meaning">
        <SingleChoice
          options={SHORT_MEANING_OPTIONS}
          value={filters.shortMeaning}
          onChange={(shortMeaning) => onChange({ shortMeaning })}
        />
      </Group>
    </div>
  );
}
