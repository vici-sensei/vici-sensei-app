"use client";

import { useMemo } from "react";
import { personName, type StaffOccurrence, type StaffOverview } from "@/lib/client-data/lessonsStaff";
import { formatKey, formatTimeRange, localDateKey, weekRange } from "@/lib/lessons/time";
import { SeatDots } from "@/app/(shell)/lessons/LessonCard";
import { Avatar, Pill } from "./staffUi";
import { profileKey } from "@/lib/client-data/lessonsStaff";

const occKey = (o: StaffOccurrence) => `${o.class_id}|${o.ny_date}`;

function StaffCard({ occ, overview, tz, nowMs, onOpen }: { occ: StaffOccurrence; overview: StaffOverview; tz: string; nowMs: number; onOpen: (o: StaffOccurrence) => void }) {
  const startMs = Date.parse(occ.starts_at);
  const endMs = Date.parse(occ.ends_at);
  const past = endMs <= nowMs;
  const substituted = occ.teacher.user_id !== occ.regular_teacher.user_id || occ.teacher.region !== occ.regular_teacher.region;
  const teacher = personName(overview.people, occ.teacher);
  const extras = occ.attendees.filter((a) => a.source === "extra").length;
  const unmarked = past && !occ.cancelled ? occ.attendees.filter((a) => a.attendance === null).length : 0;

  const tone = occ.cancelled
    ? "border-dashed border-accent-red/40 bg-accent-red/[0.04]"
    : occ.taken >= occ.capacity
      ? "border-accent-gold/30 bg-accent-gold/[0.05]"
      : "border-border-soft bg-white/[0.03] hover:border-white/20 hover:bg-white/[0.06]";

  return (
    <button
      type="button"
      onClick={() => onOpen(occ)}
      aria-label={`${formatTimeRange(startMs, endMs, tz)}, ${occ.title}, ${teacher}, ${occ.taken} of ${occ.capacity} seats${occ.cancelled ? ", cancelled" : ""}`}
      className={`block w-full cursor-pointer rounded-xl border p-3 text-left transition-colors ${tone} ${past ? "opacity-60" : ""}`}
    >
      <div className={`text-[0.82rem] font-extrabold ${occ.cancelled ? "line-through decoration-white/30" : ""}`}>{formatTimeRange(startMs, endMs, tz)}</div>
      <div className="mt-1 text-[0.85rem] font-bold">
        {occ.title}
        {occ.level_label ? <span className="ml-1.5 rounded-md bg-white/10 px-1.5 py-0.5 text-[0.68rem] font-extrabold text-text-muted">{occ.level_label}</span> : null}
      </div>
      <div className="mt-0.5 truncate text-[0.78rem] text-text-muted">{teacher}</div>

      <div className="mt-2 flex flex-wrap gap-1">
        {occ.cancelled ? <Pill tone="red">{occ.cancelled_by_vacation ? "Vacation" : "Cancelled"}</Pill> : null}
        {occ.original_starts_at ? <Pill tone="orange">Moved</Pill> : null}
        {substituted ? <Pill tone="blue">Substitute</Pill> : null}
        {occ.kind === "one_off" ? <Pill tone="gold">One-off</Pill> : null}
        {unmarked > 0 ? <Pill tone="muted">{unmarked} to mark</Pill> : null}
      </div>

      <div className="mt-2 flex items-center justify-between gap-2 text-[0.74rem] text-text-muted">
        <span className="inline-flex items-center gap-1.5">
          <SeatDots taken={occ.taken} capacity={occ.capacity} />
          {occ.taken}/{occ.capacity}
          {extras > 0 ? <span className="font-bold text-accent-gold">+{extras}</span> : null}
        </span>
        <span className="inline-flex -space-x-1.5">
          {occ.attendees.slice(0, 4).map((a) => (
            <span key={profileKey(a)} className="rounded-full ring-2 ring-[#0b0f19]">
              <Avatar name={personName(overview.people, a)} src={overview.people[profileKey(a)]?.avatar_url} size={20} />
            </span>
          ))}
        </span>
      </div>
    </button>
  );
}

/** A week of lessons, a column per day on a wide screen and a list on a phone. */
export function StaffSchedule({
  overview,
  tz,
  nowMs,
  todayKey,
  anchorKey,
  weekStart = 1,
  onOpen,
}: {
  overview: StaffOverview;
  tz: string;
  nowMs: number;
  todayKey: string;
  anchorKey: string;
  weekStart?: number;
  onOpen: (o: StaffOccurrence) => void;
}) {
  const week = weekRange(anchorKey, weekStart, tz);
  const byDay = useMemo(() => {
    const map = new Map<string, StaffOccurrence[]>();
    for (const o of overview.occurrences) {
      const ms = Date.parse(o.starts_at);
      if (ms < week.startMs || ms >= week.endMs) continue;
      const key = localDateKey(ms, tz);
      map.set(key, [...(map.get(key) ?? []), o]);
    }
    return map;
  }, [overview.occurrences, week.startMs, week.endMs, tz]);
  const total = [...byDay.values()].reduce((n, l) => n + l.length, 0);

  return (
    <>
      {total === 0 ? (
        <p className="mb-3 rounded-xl border border-border-soft bg-white/[0.02] p-4 text-center text-[0.88rem] text-text-muted">
          {overview.role === "teacher" ? "You have no lessons this week." : "No lessons are scheduled this week."}
        </p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-7">
        {week.days.map((key) => {
          const list = byDay.get(key) ?? [];
          const isToday = key === todayKey;
          return (
            <section
              key={key}
              aria-label={formatKey(key, { weekday: "long", month: "long", day: "numeric" })}
              className={`${list.length === 0 ? "hidden xl:block" : ""} min-w-0 rounded-2xl border p-3 ${isToday ? "border-accent-red/40 bg-accent-red/[0.04]" : "border-border-soft bg-bg-cards"}`}
            >
              <header className="mb-2.5 flex items-baseline gap-2">
                <span className={`text-[0.78rem] font-extrabold uppercase tracking-wider ${isToday ? "text-accent-red" : "text-text-muted"}`}>{formatKey(key, { weekday: "short" })}</span>
                <span className="text-lg font-extrabold">{formatKey(key, { day: "numeric" })}</span>
                <span className="text-[0.75rem] text-text-muted">{formatKey(key, { month: "short" })}</span>
                {isToday ? <span className="ml-auto rounded-md bg-accent-red/15 px-1.5 py-0.5 text-[0.65rem] font-extrabold text-accent-red">TODAY</span> : null}
              </header>
              {list.length === 0 ? (
                <p className="py-2 text-center text-[0.8rem] text-text-muted">—</p>
              ) : (
                <div className="space-y-2">
                  {list.map((o) => (
                    <StaffCard key={occKey(o)} occ={o} overview={overview} tz={tz} nowMs={nowMs} onOpen={onOpen} />
                  ))}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
