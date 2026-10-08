"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/app/components/ui/PageHeader";
import { useToast } from "@/app/components/ui/Toast";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useServerClockOffset } from "@/lib/client-data/serverClockOffset";
import { useStudySettingsContext } from "@/lib/client-data/StudySettingsContext";
import {
  LessonsApiError,
  STALE_SCHEDULE_CODES,
  lessonActions,
  lessonErrorMessage,
  useLessonSchedule,
} from "@/lib/client-data/lessons";
import { useLessonNotifications } from "@/lib/client-data/lessonsNotifications";
import { useWaitlist, waitlistActions } from "@/lib/client-data/lessonsWaitlist";
import { addDaysKey, addMonthsKey, formatKey, formatWeekLabel, monthRange, wallToInstant, weekRange, weekStartFor } from "@/lib/lessons/time";
import { toLessonView } from "@/lib/lessons/types";
import { useLocalToday } from "@/lib/lessons/useLocalToday";
import { useClientClock } from "@/lib/useClientClock";
import { resolveTimeZone } from "@/lib/timezone";
import { CalendarSettings } from "./CalendarSettings";
import type { LessonHandlers } from "./LessonDialog";
import { LessonsCalendar } from "./LessonsCalendar";
import { MonthView } from "./MonthView";
import { NotificationBanner, NotificationsButton, NotificationsModal } from "./NotificationsPanel";
import { LessonsError, LessonsNoAccess, LessonsSkeleton, LessonsTeacherNotice } from "./LessonsStates";
import { LessonsToolbar, type LessonsView } from "./LessonsToolbar";
import { YearView } from "./YearView";

export default function LessonsPage() {
  const { user } = useAuth();
  const { data: studySettings } = useStudySettingsContext();
  const { showToast } = useToast();

  // Shown in the account's own timezone (the one the study day already uses), not New York's.
  const tz = resolveTimeZone(studySettings);
  const todayKey = useLocalToday(tz);
  const clockOffsetMs = useServerClockOffset();
  const nowMs = useClientClock(30_000, { offsetMs: clockOffsetMs });

  const [view, setView] = useState<LessonsView>("week");
  // null = follow today, so the page is still on the right day after midnight passes.
  const [anchor, setAnchor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const anchorKey = anchor ?? todayKey;

  // Three weeks around the day on screen, whatever weekday the student's week starts on: any week of
  // theirs that contains that day fits inside, so the range never has to wait for the student's own
  // settings (which come WITH the answer). It also holds the week before and after, for the arrows.
  // The month view needs the whole month (and a week either side, whichever weekday the grid starts on); the
  // year view shows no lessons, so it asks for the same few weeks as the others just to learn about the student.
  const range = useMemo(() => {
    if (!anchorKey) return null;
    const month = view === "month" ? monthRange(anchorKey, 1, tz) : null;
    const fromKey = month ? addDaysKey(month.firstKey, -7) : addDaysKey(anchorKey, -7);
    const toKey = month ? addDaysKey(month.lastKey, 8) : addDaysKey(anchorKey, 14);
    return { from: new Date(wallToInstant(fromKey, 0, 0, tz)).toISOString(), to: new Date(wallToInstant(toKey, 0, 0, tz)).toISOString() };
  }, [anchorKey, tz, view]);
  const { data, status, error, refetch } = useLessonSchedule(user, range);

  const { data: notifications, mutate: mutateNotifications, refetch: refetchNotifications } = useLessonNotifications(user);
  const [inboxOpen, setInboxOpen] = useState(false);
  const { data: waitlistData, refetch: refetchWaitlist } = useWaitlist(user);
  const waitlist = useMemo(() => waitlistData ?? [], [waitlistData]);
  // New notices (a reminder, a cancellation, a free seat) and the seat counts they are about appear without a
  // reload: every minute while the page is on screen, and at once when the student comes back to the tab.
  useEffect(() => {
    const reload = () => {
      if (document.visibilityState !== "visible") return;
      void refetchNotifications();
      void refetchWaitlist();
      void refetch();
    };
    const id = window.setInterval(reload, 60_000);
    document.addEventListener("visibilitychange", reload);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", reload);
    };
  }, [refetchNotifications, refetchWaitlist, refetch]);

  const result = data && range && data.from === range.from && data.to === range.to ? data : null;
  const schedule = result?.kind === "ok" ? result.schedule : null;
  const student = schedule?.student ?? null;
  const lessons = useMemo(() => (schedule ? schedule.occurrences.map(toLessonView) : []), [schedule]);

  const weekStart = student && anchorKey ? weekStartFor(student, anchorKey, tz) : 1;
  const week = anchorKey ? weekRange(anchorKey, weekStart, tz) : null;
  // The grid and the "swap with my lesson this week" rules are about THIS week only.
  const weekLessons = week ? lessons.filter((l) => l.startMs >= week.startMs && l.startMs < week.endMs) : [];

  const run = useCallback(
    async (task: () => Promise<unknown>, success: string, alsoReload?: () => Promise<unknown>): Promise<boolean> => {
      setBusy(true);
      try {
        await task();
        showToast(success);
        await Promise.all([refetch(), alsoReload?.()]);
        return true;
      } catch (err) {
        showToast(lessonErrorMessage(err), "error");
        // The schedule on screen was out of date (someone took the seat, the lesson moved...): reload it.
        if (err instanceof LessonsApiError && STALE_SCHEDULE_CODES.has(err.code)) await Promise.all([refetch(), alsoReload?.()]);
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refetch, showToast]
  );

  // "A seat opened" -> Confirm, from the banner. The first one to confirm gets the seat; the writer checks
  // everything again, so a late confirm simply fails and the student stays on the list.
  const confirmSeat = useCallback(
    async (entryId: number): Promise<"ok" | "gone" | "failed"> => {
      setBusy(true);
      try {
        await waitlistActions.confirm(entryId);
        showToast("You got the seat. See you in class!");
        await Promise.all([refetch(), refetchWaitlist()]);
        return "ok";
      } catch (err) {
        const code = err instanceof LessonsApiError ? err.code : "";
        showToast(
          code === "class_full"
            ? "Someone confirmed before you. You're still on the waitlist."
            : code === "quota_reached"
              ? "You're at your weekly limit. Open the lesson to choose what to give up."
              : lessonErrorMessage(err),
          "error"
        );
        await Promise.all([refetch(), refetchWaitlist()]);
        return code === "not_found" ? "gone" : "failed";
      } finally {
        setBusy(false);
      }
    },
    [refetch, refetchWaitlist, showToast]
  );

  const leaveWaitlist = useCallback(
    async (entryId: number): Promise<"ok" | "gone" | "failed"> => {
      setBusy(true);
      try {
        await waitlistActions.leave(entryId);
        await refetchWaitlist();
        return "ok";
      } catch (err) {
        showToast(lessonErrorMessage(err), "error");
        await refetchWaitlist();
        return err instanceof LessonsApiError && err.code === "not_found" ? "gone" : "failed";
      } finally {
        setBusy(false);
      }
    },
    [refetchWaitlist, showToast]
  );

  const handlers = useMemo<LessonHandlers>(
    () => ({
      enroll: (classId, replaceClassId) =>
        run(() => lessonActions.enroll(classId, replaceClassId), replaceClassId ? "Your weekly class is changed." : "You're in. See you every week!"),
      leave: (classId) => run(() => lessonActions.unenroll(classId), "You left the class."),
      moveOnce: (to, from) =>
        run(
          () =>
            lessonActions.moveOnce(
              { classId: to.class_id, nyDate: to.ny_date },
              from ? { classId: from.class_id, nyDate: from.ny_date } : null
            ),
          "Done. It's just for this week."
        ),
      undoMove: (toClass, toDate) => run(() => lessonActions.unmove({ classId: toClass, nyDate: toDate }), "You're back to your usual lesson."),
      waitlistJoin: (join) => run(() => waitlistActions.join(join), "You're on the waitlist. We'll tell you when a seat opens.", refetchWaitlist),
      waitlistLeave: (entryId) => run(() => waitlistActions.leave(entryId), "You're off the waitlist.", refetchWaitlist),
    }),
    [run, refetchWaitlist]
  );

  const move = (direction: 1 | -1) => {
    if (!anchorKey) return;
    if (view === "year") setAnchor(addMonthsKey(anchorKey, 12 * direction));
    else if (view === "month") setAnchor(addMonthsKey(anchorKey, direction));
    else setAnchor(addDaysKey(anchorKey, direction * (view === "week" ? 7 : 1)));
  };
  const label = !anchorKey || !week
    ? ""
    : view === "year"
      ? anchorKey.slice(0, 4)
      : view === "month"
        ? formatKey(anchorKey, { month: "long", year: "numeric" })
        : view === "week"
          ? formatWeekLabel(week)
          : formatKey(anchorKey, { weekday: "long", month: "long", day: "numeric" });
  const isCurrent =
    anchor === null ||
    (todayKey !== null &&
      (view === "year"
        ? todayKey.slice(0, 4) === anchorKey?.slice(0, 4)
        : view === "month"
          ? todayKey.slice(0, 7) === anchorKey?.slice(0, 7)
          : view === "week"
            ? weekRange(todayKey, weekStart, tz).startKey === week?.startKey
            : anchor === todayKey));

  let body;
  if (result?.kind === "teacher") {
    body = <LessonsTeacherNotice />;
  } else if (status === "error" && !schedule) {
    body = <LessonsError message={error ?? "Please try again."} onRetry={() => void refetch()} />;
  } else if (!schedule || !student || nowMs === null || !anchorKey || todayKey === null) {
    body = <LessonsSkeleton />;
  } else if (!student.access) {
    body = <LessonsNoAccess />;
  } else {
    body = (
      <>
        <LessonsToolbar
          view={view}
          onViewChange={setView}
          label={label}
          onPrev={() => move(-1)}
          onNext={() => move(1)}
          onToday={() => setAnchor(null)}
          isCurrent={isCurrent}
          tz={tz}
          nowMs={nowMs}
          actions={<NotificationsButton unread={notifications?.unread ?? 0} onClick={() => setInboxOpen(true)} />}
        />
        {view === "month" ? (
          <MonthView
            lessons={lessons}
            anchorKey={anchorKey}
            weekStart={weekStart}
            tz={tz}
            todayKey={todayKey}
            onPickDay={(dayKey) => {
              setAnchor(dayKey);
              setView("week");
            }}
          />
        ) : view === "year" ? (
          <YearView
            anchorKey={anchorKey}
            weekStart={weekStart}
            tz={tz}
            todayKey={todayKey}
            onPickMonth={(firstKey) => {
              setAnchor(firstKey);
              setView("month");
            }}
          />
        ) : (
          <LessonsCalendar
            lessons={weekLessons}
            student={student}
            tz={tz}
            nowMs={nowMs}
            todayKey={todayKey}
            view={view}
            anchorKey={anchorKey}
            weekStart={weekStart}
            busy={busy}
            waitlist={waitlist}
            handlers={handlers}
          />
        )}
        <CalendarSettings
          student={student}
          busy={busy}
          onSave={(next) => void run(() => lessonActions.setWeekStart(next), "Saved. It starts with next week.")}
        />
      </>
    );
  }

  return (
    <div>
      <PageHeader title="Lessons" subtitle="Pick your weekly class, or go to another lesson for a week." />
      <NotificationBanner list={notifications} mutate={mutateNotifications} busy={busy} onConfirmSeat={confirmSeat} onLeaveWaitlist={leaveWaitlist} />
      {body}
      {inboxOpen && nowMs !== null ? (
        <NotificationsModal user={user} list={notifications} nowMs={nowMs} mutate={mutateNotifications} onClose={() => setInboxOpen(false)} />
      ) : null}
    </div>
  );
}
