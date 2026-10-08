"use client";

import { useMemo, useState } from "react";
import { FaArrowUpRightFromSquare, FaCalendarDays, FaChalkboardUser, FaClock, FaEarthAmericas } from "react-icons/fa6";
import { Button } from "@/app/components/ui/Button";
import { Modal } from "@/app/components/ui/Modal";
import { planLesson } from "@/lib/lessons/actions";
import {
  NY_TZ,
  formatClock,
  formatKey,
  formatTimeRange,
  localDateKey,
  zoneAbbreviation,
} from "@/lib/lessons/time";
import { lessonKey, type FixedClass, type LessonStudent, type LessonView } from "@/lib/lessons/types";
import { SeatDots, lessonShiftText } from "./LessonCard";

/** Each resolves to whether the change went through; the calendar closes the dialog on success. */
export interface LessonHandlers {
  enroll: (classId: string, replaceClassId: string | null) => Promise<boolean>;
  leave: (classId: string) => Promise<boolean>;
  moveOnce: (to: LessonView, from: LessonView | null) => Promise<boolean>;
  undoMove: (toClass: string, toDate: string) => Promise<boolean>;
}

interface LessonDialogProps {
  lesson: LessonView;
  all: LessonView[];
  student: LessonStudent;
  nowMs: number;
  tz: string;
  weekStart: number;
  busy: boolean;
  onClose: () => void;
  handlers: LessonHandlers;
}

const ADD = "add";

function describeFixed(f: FixedClass, tz: string): string {
  const next = Date.parse(f.next_starts_at);
  return `${f.title} · next ${formatKey(localDateKey(next, tz), { weekday: "short" })} ${formatClock(next, tz)}`;
}

function describeLesson(l: LessonView, tz: string): string {
  return `${l.title} · ${formatKey(localDateKey(l.startMs, tz), { weekday: "short", month: "short", day: "numeric" })} ${formatClock(l.startMs, tz)}`;
}

export function LessonDialog({ lesson, all, student, nowMs, tz, weekStart, busy, onClose, handlers }: LessonDialogProps) {
  const plan = useMemo(
    () => planLesson({ lesson, all, student, nowMs, tz, weekStart }),
    [lesson, all, student, nowMs, tz, weekStart]
  );

  const [replaceClassId, setReplaceClassId] = useState<string>(plan.weekly?.replace[0]?.class_id ?? "");
  const [onceChoice, setOnceChoice] = useState<string>(plan.once?.swaps[0] ? lessonKey(plan.once.swaps[0]) : ADD);
  const [confirmingLeave, setConfirmingLeave] = useState(false);

  const localKey = localDateKey(lesson.startMs, tz);
  const shift = lesson.cancelled ? null : lessonShiftText(lesson, tz);
  const teacher = lesson.teacher.display_name?.trim() || "Teacher";
  const full = lesson.taken >= lesson.capacity;
  const swapChosen = plan.once?.swaps.find((s) => lessonKey(s) === onceChoice) ?? null;

  const radio = "mt-0.5 h-4 w-4 shrink-0 cursor-pointer accent-[#ff4a5a]";
  const row = "flex cursor-pointer items-start gap-2.5 rounded-lg border border-border-soft bg-white/[0.03] p-2.5 text-[0.84rem]";
  const section = "mt-5 rounded-xl border border-border-soft bg-white/[0.02] p-4";
  const hint = "mt-1.5 text-[0.78rem] leading-normal text-text-muted";

  return (
    <Modal onClose={onClose} labelledBy="lesson-dialog-title" showCloseButton>
      {/* The Modal card is a fixed 440px at most and does not scroll, and this dialog can be tall
          (two option sections with a choice each): it scrolls inside the card on short screens. */}
      <div className="max-h-[calc(100dvh-7rem)] w-full overflow-y-auto pr-1 text-left">
        <h3 id="lesson-dialog-title" className="pr-8 text-xl font-extrabold leading-tight">
          {lesson.title}
          {lesson.level_label ? (
            <span className="ml-2 align-middle rounded-md bg-white/10 px-2 py-0.5 text-xs font-extrabold text-text-muted">{lesson.level_label}</span>
          ) : null}
        </h3>

        {lesson.cancelled ? (
          <p className="mt-3 rounded-lg bg-accent-red/10 p-3 text-[0.84rem] font-bold text-[#ff8a93]">
            Cancelled{lesson.cancel_reason ? `: ${lesson.cancel_reason}` : ""}
          </p>
        ) : null}

        <ul className="mt-4 space-y-2.5 text-[0.88rem]">
          <li className="flex items-start gap-2.5">
            <FaCalendarDays className="mt-0.5 shrink-0 text-text-muted" aria-hidden="true" />
            <span>
              <strong>{formatKey(localKey, { weekday: "long", month: "long", day: "numeric" })}</strong>
              <br />
              {formatTimeRange(lesson.startMs, lesson.endMs, tz)} <span className="text-text-muted">({zoneAbbreviation(lesson.startMs, tz)})</span>
              {lesson.original_starts_at ? (
                <span className="block text-[0.78rem] text-accent-orange">
                  Moved: usually {formatKey(localDateKey(Date.parse(lesson.original_starts_at), tz), { weekday: "short", month: "short", day: "numeric" })},{" "}
                  {formatClock(Date.parse(lesson.original_starts_at), tz)}
                </span>
              ) : null}
            </span>
          </li>
          <li className="flex items-start gap-2.5 text-text-muted">
            <FaEarthAmericas className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              New York: {formatKey(lesson.ny_date, { weekday: "short", month: "short", day: "numeric" })},{" "}
              {formatTimeRange(lesson.startMs, lesson.endMs, NY_TZ)}
            </span>
          </li>
          <li className="flex items-center gap-2.5">
            <FaChalkboardUser className="shrink-0 text-text-muted" aria-hidden="true" />
            <span>
              {teacher}
              {lesson.teacher_changed ? <span className="text-text-muted"> (substitute)</span> : null}
            </span>
          </li>
          <li className="flex items-center gap-2.5">
            <SeatDots taken={lesson.taken} capacity={lesson.capacity} />
            <span className="text-text-muted">
              {lesson.cancelled ? "No seats: the lesson is cancelled" : `${lesson.taken} of ${lesson.capacity} seats taken${full && !lesson.mine ? " · full" : ""}`}
            </span>
          </li>
        </ul>

        {shift ? (
          <p className="mt-4 flex items-start gap-2 rounded-lg bg-accent-orange/10 p-3 text-[0.8rem] leading-normal text-accent-orange">
            <FaClock className="mt-0.5 shrink-0" aria-hidden="true" />
            <span>
              This lesson is {shift} on your clock. The class keeps its New York time, and the US and your country change their clocks on
              different dates.
            </span>
          </p>
        ) : null}

        {lesson.mine && lesson.meeting_url ? (
          <a
            href={lesson.meeting_url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-4 inline-flex items-center gap-2 text-[0.88rem] font-bold text-accent-blue hover:underline"
          >
            <FaArrowUpRightFromSquare aria-hidden="true" />
            Open the lesson link
          </a>
        ) : null}

        {plan.note ? <p className={`${hint} mt-4`}>{plan.note}</p> : null}

        {plan.state === "standing" && plan.leave ? (
          <div className={section}>
            <p className="text-[0.88rem] font-bold">This is your weekly class.</p>
            <p className={hint}>You are in it every week. To take just one week off, pick another lesson that week instead.</p>
            {confirmingLeave ? (
              <div className="mt-3">
                <p className="text-[0.84rem]">Leave this class? Your seat is released from the next lesson.</p>
                <div className="mt-3 flex gap-2">
                  <Button size="sm" danger loading={busy} onClick={() => handlers.leave(plan.leave!.classId)}>
                    Yes, leave
                  </Button>
                  <Button size="sm" variant="secondary" disabled={busy} onClick={() => setConfirmingLeave(false)}>
                    Keep it
                  </Button>
                </div>
              </div>
            ) : (
              <Button size="sm" variant="secondary" danger className="mt-3" onClick={() => setConfirmingLeave(true)}>
                Leave this class
              </Button>
            )}
          </div>
        ) : null}

        {plan.undoMove ? (
          <div className={section}>
            <p className="text-[0.88rem] font-bold">
              {plan.state === "move" ? "You're going to this lesson just this week." : "You gave this lesson up for this week."}
            </p>
            <p className={hint}>
              {plan.state === "move"
                ? "Undo the move to go back to your usual lesson this week."
                : "Go back to it, and your seat in the other lesson is released."}
            </p>
            <Button size="sm" className="mt-3" loading={busy} onClick={() => handlers.undoMove(plan.undoMove!.toClass, plan.undoMove!.toDate)}>
              {plan.state === "move" ? "Undo this move" : "Go back to this lesson"}
            </Button>
          </div>
        ) : null}

        {plan.weekly ? (
          <div className={section}>
            <p className="text-[0.88rem] font-bold">Every week</p>
            <p className={hint}>Make this your weekly class: you keep the seat and come every week until you change it.</p>
            {plan.weekly.allowed ? (
              <>
                {plan.weekly.replace.length > 1 ? (
                  <fieldset className="mt-3 space-y-1.5">
                    <legend className="mb-1 text-[0.78rem] text-text-muted">Replace which of your weekly classes?</legend>
                    {plan.weekly.replace.map((f) => (
                      <label key={f.class_id} className={row}>
                        <input type="radio" name="replace" className={radio} checked={replaceClassId === f.class_id} onChange={() => setReplaceClassId(f.class_id)} />
                        <span>{describeFixed(f, tz)}</span>
                      </label>
                    ))}
                  </fieldset>
                ) : null}
                {plan.weekly.replace.length === 1 ? (
                  <p className={hint}>It replaces your weekly class “{plan.weekly.replace[0].title}”.</p>
                ) : null}
                <Button
                  size="sm"
                  className="mt-3"
                  loading={busy}
                  onClick={() => handlers.enroll(lesson.class_id, plan.weekly!.replace.length === 0 ? null : plan.weekly!.replace.length === 1 ? plan.weekly!.replace[0].class_id : replaceClassId)}
                >
                  {plan.weekly.replace.length === 0 ? "Join every week" : "Make this my weekly class"}
                </Button>
              </>
            ) : (
              <p className="mt-3 text-[0.82rem] font-bold text-[#ff8a93]">{plan.weekly.reason}</p>
            )}
          </div>
        ) : null}

        {plan.once ? (
          <div className={section}>
            <p className="text-[0.88rem] font-bold">Just this week</p>
            <p className={hint}>Go to this lesson once. Next week you are back to your usual class.</p>
            {plan.once.allowed ? (
              <>
                {plan.once.swaps.length > 0 && (plan.once.swaps.length > 1 || plan.once.canAdd) ? (
                  <fieldset className="mt-3 space-y-1.5">
                    <legend className="mb-1 text-[0.78rem] text-text-muted">Instead of which lesson?</legend>
                    {plan.once.swaps.map((s) => (
                      <label key={lessonKey(s)} className={row}>
                        <input type="radio" name="once" className={radio} checked={onceChoice === lessonKey(s)} onChange={() => setOnceChoice(lessonKey(s))} />
                        <span>Instead of {describeLesson(s, tz)}</span>
                      </label>
                    ))}
                    {plan.once.canAdd ? (
                      <label className={row}>
                        <input type="radio" name="once" className={radio} checked={onceChoice === ADD} onChange={() => setOnceChoice(ADD)} />
                        <span>In addition to my other lessons</span>
                      </label>
                    ) : null}
                  </fieldset>
                ) : null}
                {plan.once.swaps.length === 1 && !plan.once.canAdd ? (
                  <p className={hint}>You will skip {describeLesson(plan.once.swaps[0], tz)} that week.</p>
                ) : null}
                {plan.once.swaps.length === 0 ? <p className={hint}>You have no lesson that week, so this is an extra one.</p> : null}
                <Button
                  size="sm"
                  variant="secondary"
                  className="mt-3"
                  loading={busy}
                  onClick={() => handlers.moveOnce(lesson, plan.once!.swaps.length === 0 || onceChoice === ADD ? null : swapChosen ?? plan.once!.swaps[0])}
                >
                  Go just this week
                </Button>
              </>
            ) : (
              <p className="mt-3 text-[0.82rem] font-bold text-[#ff8a93]">{plan.once.reason}</p>
            )}
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

