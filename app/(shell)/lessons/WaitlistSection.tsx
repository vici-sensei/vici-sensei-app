"use client";

import { useState } from "react";
import { FaHourglassHalf } from "react-icons/fa6";
import { Button } from "@/app/components/ui/Button";
import type { WaitlistPlan } from "@/lib/lessons/actions";
import { formatClock, formatKey, localDateKey } from "@/lib/lessons/time";
import { lessonKey, type LessonView } from "@/lib/lessons/types";
import { WAITLIST_LIMIT, fixedEntryFor, onceEntryFor, type WaitlistEntry } from "@/lib/lessons/waitlist";
import type { WaitlistJoin } from "@/lib/client-data/lessonsWaitlist";
import { hintClass, radioClass, rowClass, sectionClass } from "./dialogStyles";

export interface WaitlistHandlers {
  waitlistJoin: (join: WaitlistJoin) => Promise<boolean>;
  waitlistLeave: (entryId: number) => Promise<boolean>;
}

const ADD = "add";

function describeLesson(l: LessonView, tz: string): string {
  return `${l.title} · ${formatKey(localDateKey(l.startMs, tz), { weekday: "short", month: "short", day: "numeric" })} ${formatClock(l.startMs, tz)}`;
}

/** What a student can do about a FULL lesson: wait for a seat in the weekly class, or for this one lesson.
 * Everybody waiting is told when a seat opens and the first one to confirm gets it. When a seat is free the
 * normal booking buttons of the dialog work, so this section only exists while the lesson is full. */
export function WaitlistSection({
  lesson,
  plan,
  entries,
  tz,
  busy,
  handlers,
}: {
  lesson: LessonView;
  plan: WaitlistPlan;
  entries: WaitlistEntry[];
  tz: string;
  busy: boolean;
  handlers: WaitlistHandlers;
}) {
  const fixedEntry = fixedEntryFor(entries, lesson.class_id);
  const onceEntry = onceEntryFor(entries, lesson.class_id, lesson.ny_date);
  const atLimit = entries.length >= WAITLIST_LIMIT;

  const [replaceClassId, setReplaceClassId] = useState(plan.weekly?.replace[0]?.class_id ?? "");
  const [onceChoice, setOnceChoice] = useState(plan.once?.swaps[0] ? lessonKey(plan.once.swaps[0]) : ADD);

  const weekly = plan.weekly;
  const once = plan.once;
  const swapChosen = once?.swaps.find((s) => lessonKey(s) === onceChoice) ?? null;

  return (
    <div className={sectionClass}>
      <p className="flex items-center gap-2 text-[0.88rem] font-bold">
        <FaHourglassHalf className="text-accent-gold" aria-hidden="true" />
        This lesson is full
      </p>
      <p className={hintClass}>
        Join the waitlist and we&rsquo;ll tell you when a seat opens. Everybody waiting is told, and the first one to confirm gets the seat.
      </p>

      {fixedEntry ? (
        <div className="mt-4">
          <p className="text-[0.84rem] font-bold text-accent-gold">You&rsquo;re waiting for a weekly seat in this class.</p>
          {fixedEntry.replace_title ? <p className={hintClass}>If one opens, it replaces your weekly class &ldquo;{fixedEntry.replace_title}&rdquo;.</p> : null}
          <Button size="sm" variant="secondary" className="mt-2" disabled={busy} onClick={() => handlers.waitlistLeave(fixedEntry.id)}>
            Stop waiting
          </Button>
        </div>
      ) : weekly ? (
        <div className="mt-4">
          <p className="text-[0.84rem] font-bold">Every week</p>
          {weekly.allowed ? (
            <>
              {weekly.replace.length > 1 ? (
                <fieldset className="mt-2 space-y-1.5">
                  <legend className="mb-1 text-[0.78rem] text-text-muted">If a seat opens, replace which of your weekly classes?</legend>
                  {weekly.replace.map((f) => (
                    <label key={f.class_id} className={rowClass}>
                      <input type="radio" name="wl-replace" className={radioClass} checked={replaceClassId === f.class_id} onChange={() => setReplaceClassId(f.class_id)} />
                      <span>{f.title}</span>
                    </label>
                  ))}
                </fieldset>
              ) : null}
              {weekly.replace.length === 1 ? <p className={hintClass}>If a seat opens, it replaces your weekly class &ldquo;{weekly.replace[0].title}&rdquo;.</p> : null}
              <Button
                size="sm"
                className="mt-2"
                loading={busy}
                disabled={atLimit}
                onClick={() =>
                  handlers.waitlistJoin({
                    classId: lesson.class_id,
                    kind: "fixed",
                    replaceClassId: weekly.replace.length === 0 ? null : weekly.replace.length === 1 ? weekly.replace[0].class_id : replaceClassId,
                  })
                }
              >
                Wait for a weekly seat
              </Button>
            </>
          ) : (
            <p className="mt-2 text-[0.82rem] font-bold text-[#ff8a93]">{weekly.reason}</p>
          )}
        </div>
      ) : null}

      {onceEntry ? (
        <div className="mt-4">
          <p className="text-[0.84rem] font-bold text-accent-gold">You&rsquo;re waiting for a seat in this lesson, just this week.</p>
          {onceEntry.swap_title ? <p className={hintClass}>If one opens, it replaces your lesson &ldquo;{onceEntry.swap_title}&rdquo; that week.</p> : null}
          <Button size="sm" variant="secondary" className="mt-2" disabled={busy} onClick={() => handlers.waitlistLeave(onceEntry.id)}>
            Stop waiting
          </Button>
        </div>
      ) : once && !fixedEntry ? (
        // Waiting for the weekly seat already covers this lesson.
        <div className="mt-4">
          <p className="text-[0.84rem] font-bold">Just this week</p>
          {once.allowed ? (
            <>
              {once.swaps.length > 0 && (once.swaps.length > 1 || once.canAdd) ? (
                <fieldset className="mt-2 space-y-1.5">
                  <legend className="mb-1 text-[0.78rem] text-text-muted">If a seat opens, instead of which lesson?</legend>
                  {once.swaps.map((s) => (
                    <label key={lessonKey(s)} className={rowClass}>
                      <input type="radio" name="wl-once" className={radioClass} checked={onceChoice === lessonKey(s)} onChange={() => setOnceChoice(lessonKey(s))} />
                      <span>Instead of {describeLesson(s, tz)}</span>
                    </label>
                  ))}
                  {once.canAdd ? (
                    <label className={rowClass}>
                      <input type="radio" name="wl-once" className={radioClass} checked={onceChoice === ADD} onChange={() => setOnceChoice(ADD)} />
                      <span>In addition to my other lessons</span>
                    </label>
                  ) : null}
                </fieldset>
              ) : null}
              {once.swaps.length === 1 && !once.canAdd ? <p className={hintClass}>If a seat opens, it replaces {describeLesson(once.swaps[0], tz)}.</p> : null}
              <Button
                size="sm"
                variant="secondary"
                className="mt-2"
                loading={busy}
                disabled={atLimit}
                onClick={() => {
                  const swap = once.swaps.length === 0 || onceChoice === ADD ? null : (swapChosen ?? once.swaps[0]);
                  return handlers.waitlistJoin({
                    classId: lesson.class_id,
                    kind: "once",
                    nyDate: lesson.ny_date,
                    swap: swap ? { classId: swap.class_id, nyDate: swap.ny_date } : null,
                  });
                }}
              >
                Wait for this lesson
              </Button>
            </>
          ) : (
            <p className="mt-2 text-[0.82rem] font-bold text-[#ff8a93]">{once.reason}</p>
          )}
        </div>
      ) : null}

      {atLimit && !fixedEntry && !onceEntry ? (
        <p className={`${hintClass} text-accent-orange`}>You can wait for up to {WAITLIST_LIMIT} things at a time. Stop waiting for one to add another.</p>
      ) : null}
    </div>
  );
}
