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
import { addDaysKey, formatKey, formatWeekLabel, wallToInstant, weekRange, weekStartFor } from "@/lib/lessons/time";
import { toLessonView } from "@/lib/lessons/types";
import { useLocalToday } from "@/lib/lessons/useLocalToday";
import { useClientClock } from "@/lib/useClientClock";
import { resolveTimeZone } from "@/lib/timezone";
import { CalendarSettings } from "./CalendarSettings";
import type { LessonHandlers } from "./LessonDialog";
import { LessonsCalendar } from "./LessonsCalendar";
import { NotificationBanner, NotificationsButton, NotificationsModal } from "./NotificationsPanel";
import { LessonsError, LessonsNoAccess, LessonsSkeleton, LessonsTeacherNotice } from "./LessonsStates";
import { LessonsToolbar, type LessonsView } from "./LessonsToolbar";

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
  const range = useMemo(
    () =>
      anchorKey
        ? {
            from: new Date(wallToInstant(addDaysKey(anchorKey, -7), 0, 0, tz)).toISOString(),
            to: new Date(wallToInstant(addDaysKey(anchorKey, 14), 0, 0, tz)).toISOString(),
          }
        : null,
    [anchorKey, tz]
  );
  const { data, status, error, refetch } = useLessonSchedule(user, range);

  const { data: notifications, mutate: mutateNotifications, refetch: refetchNotifications } = useLessonNotifications(user);
  const [inboxOpen, setInboxOpen] = useState(false);
  const { data: waitlistData, refetch: refetchWaitlist } = useWaitlist(user);
  const waitlist = useMemo(() => waitlistData ?? [], [waitlistData]);
  // New notices (a reminder, a cancellation, a free seat) appear without a reload while the page is open.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refetchNotifications();
      void refetchWaitlist();
    }, 60_000);
    return () => window.clearInterval(id);
  }, [refetchNotifications, refetchWaitlist]);

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

  const step = view === "week" ? 7 : 1;
  const move = (days: number) => {
    if (anchorKey) setAnchor(addDaysKey(anchorKey, days));
  };
  const label = !anchorKey || !week ? "" : view === "week" ? formatWeekLabel(week) : formatKey(anchorKey, { weekday: "long", month: "long", day: "numeric" });
  const isCurrent =
    anchor === null || (todayKey !== null && (view === "week" ? weekRange(todayKey, weekStart, tz).startKey === week?.startKey : anchor === todayKey));

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
          onPrev={() => move(-step)}
          onNext={() => move(step)}
          onToday={() => setAnchor(null)}
          isCurrent={isCurrent}
          tz={tz}
          nowMs={nowMs}
          actions={<NotificationsButton unread={notifications?.unread ?? 0} onClick={() => setInboxOpen(true)} />}
        />
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
