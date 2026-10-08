"use client";

import { useState, type ReactNode } from "react";
import { fieldHint, fieldLabel, textInput } from "@/app/components/ui/formClasses";
import { personName, type PersonRef, type Profile } from "@/lib/client-data/lessonsStaff";
import { profileKey } from "@/lib/client-data/lessonsStaff";

/** Small pieces shared by the teachers' and admins' lesson panel. */

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "?") + (parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "")).toUpperCase();
}

export function Avatar({ name, src, size = 28 }: { name: string; src?: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) };
  if (src && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- avatars are served as-is (static export, no image optimizer)
      <img
        src={src}
        alt=""
        style={style}
        className="shrink-0 rounded-full object-cover"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span aria-hidden="true" style={style} className="inline-flex shrink-0 items-center justify-center rounded-full bg-white/10 font-extrabold text-text-muted">
      {initials(name)}
    </span>
  );
}

export function Person({ person, people, showEmail = false, size = 28 }: { person: PersonRef; people: Record<string, Profile>; showEmail?: boolean; size?: number }) {
  const profile = people[profileKey(person)];
  const name = personName(people, person);
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <Avatar name={name} src={profile?.avatar_url} size={size} />
      <span className="min-w-0">
        <span className="block truncate font-bold">{name}</span>
        {showEmail && profile?.email ? <span className="block truncate text-[0.74rem] text-text-muted">{profile.email}</span> : null}
      </span>
    </span>
  );
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h4 className="mb-2 text-[0.82rem] font-extrabold uppercase tracking-wide text-text-muted">{children}</h4>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className={fieldLabel}>{label}</span>
      {children}
      {hint ? <span className={`${fieldHint} block`}>{hint}</span> : null}
    </label>
  );
}

export const inputClass = textInput;

export const selectClass = `${textInput} cursor-pointer`;

export function Pill({ tone, children }: { tone: "green" | "blue" | "red" | "gold" | "muted" | "orange"; children: ReactNode }) {
  const tones = {
    green: "bg-accent-green/15 text-accent-green",
    blue: "bg-accent-blue/15 text-accent-blue",
    red: "bg-accent-red/15 text-[#ff8a93]",
    gold: "bg-accent-gold/15 text-accent-gold",
    orange: "bg-accent-orange/15 text-accent-orange",
    muted: "bg-white/10 text-text-muted",
  };
  return <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[0.68rem] font-extrabold ${tones[tone]}`}>{children}</span>;
}

/** The weekday names, Monday first (ISO numbers 1..7). */
export const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

/** "17:30:00" -> "17:30" */
export const hhmm = (time: string) => time.slice(0, 5);
