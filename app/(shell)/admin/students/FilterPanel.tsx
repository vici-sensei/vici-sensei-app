"use client";

import type { ReactNode } from "react";
import type { Region } from "@/lib/supabase/regions";
import type {
  ActivityFilter,
  JoinedFilter,
  ProEndsFilter,
  ProState,
  RosterFilters,
  StreakFilter,
  StudyTrack,
} from "./rosterView";

const PLAN_OPTIONS: { value: ProState; label: string }[] = [
  { value: "unlimited", label: "Pro · no end date" },
  { value: "trial", label: "Pro · with end date" },
  { value: "stripe", label: "Stripe" },
  { value: "free", label: "Free" },
];

const PRO_ENDS_OPTIONS: { value: ProEndsFilter; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "3d", label: "In ≤ 3 days" },
  { value: "7d", label: "In ≤ 7 days" },
  { value: "ended", label: "Already ended" },
];

const ACTIVITY_OPTIONS: { value: ActivityFilter; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "today", label: "Active today" },
  { value: "7d", label: "Active in last 7 days" },
  { value: "inactive7", label: "Inactive 7+ days" },
  { value: "inactive30", label: "Inactive 30+ days" },
  { value: "never", label: "Never studied" },
];

const REGION_OPTIONS: { value: Region; label: string }[] = [
  { value: "eu", label: "Europe" },
  { value: "us", label: "Americas" },
];

const JOINED_OPTIONS: { value: JoinedFilter; label: string }[] = [
  { value: "any", label: "Any time" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
];

const TRACK_OPTIONS: { value: StudyTrack; label: string }[] = [
  { value: "kana", label: "Kana" },
  { value: "standard", label: "Standard" },
];

const STREAK_OPTIONS: { value: StreakFilter; label: string }[] = [
  { value: "any", label: "Any" },
  { value: "on", label: "On a streak" },
  { value: "off", label: "No streak" },
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
  countries,
  showRegion,
}: {
  filters: RosterFilters;
  onChange: (patch: Partial<RosterFilters>) => void;
  /** Countries at least one student has, already sorted by name. */
  countries: { code: string; name: string }[];
  showRegion: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
      <Group label="Plan">
        <MultiChoice options={PLAN_OPTIONS} value={filters.plan} onChange={(plan) => onChange({ plan })} />
      </Group>
      <Group label="Pro ends">
        <SingleChoice options={PRO_ENDS_OPTIONS} value={filters.proEnds} onChange={(proEnds) => onChange({ proEnds })} />
      </Group>
      <Group label="Activity">
        <SingleChoice options={ACTIVITY_OPTIONS} value={filters.activity} onChange={(activity) => onChange({ activity })} />
      </Group>
      <Group label="Joined">
        <SingleChoice options={JOINED_OPTIONS} value={filters.joined} onChange={(joined) => onChange({ joined })} />
      </Group>
      <Group label="Streak">
        <SingleChoice options={STREAK_OPTIONS} value={filters.streak} onChange={(streak) => onChange({ streak })} />
      </Group>
      <Group label="Study track">
        <MultiChoice options={TRACK_OPTIONS} value={filters.track} onChange={(track) => onChange({ track })} />
      </Group>
      {showRegion ? (
        <Group label="Server region">
          <MultiChoice options={REGION_OPTIONS} value={filters.region} onChange={(region) => onChange({ region })} />
        </Group>
      ) : null}
      <Group label="Country">
        <select
          value={filters.country}
          onChange={(e) => onChange({ country: e.target.value })}
          aria-label="Country"
          className="w-full max-w-60 cursor-pointer rounded-lg border border-border-soft bg-gray-900 px-3 py-1.5 text-[0.85rem] text-white outline-none focus:border-accent-blue/50"
        >
          <option value="">Any country</option>
          <option value="none">Not set</option>
          {countries.map((c) => (
            <option key={c.code} value={c.code}>
              {c.name}
            </option>
          ))}
        </select>
      </Group>
    </div>
  );
}
