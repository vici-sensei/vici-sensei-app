"use client";

import { useCallback, useMemo, useState } from "react";
import { PageHeader } from "@/app/components/ui/PageHeader";
import { PillSelector } from "@/app/components/ui/PillSelector";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { useToast } from "@/app/components/ui/Toast";
import { Button } from "@/app/components/ui/Button";
import { LessonsToolbar } from "@/app/(shell)/lessons/LessonsToolbar";
import { useAuth } from "@/lib/auth/AuthProvider";
import { LessonsApiError, STALE_SCHEDULE_CODES, lessonErrorMessage } from "@/lib/client-data/lessons";
import { useServerClockOffset } from "@/lib/client-data/serverClockOffset";
import { useStudySettingsContext } from "@/lib/client-data/StudySettingsContext";
import { useStaffOverview, useStaffStudents, type StaffOccurrence } from "@/lib/client-data/lessonsStaff";
import { isLessonsEnabled } from "@/lib/lessons/flag";
import { NY_TZ, addDaysKey, formatWeekLabel, localDateKey, wallToInstant, weekRange } from "@/lib/lessons/time";
import { useLocalToday } from "@/lib/lessons/useLocalToday";
import { resolveTimeZone } from "@/lib/timezone";
import { useClientClock } from "@/lib/useClientClock";
import { ClassesTab } from "./ClassesTab";
import { OccurrenceDialog, type Act } from "./OccurrenceDialog";
import { StaffSchedule } from "./StaffSchedule";
import { StudentsTab } from "./StudentsTab";
import { VacationsTab } from "./VacationsTab";

type Tab = "schedule" | "classes" | "students" | "vacations";

/** The teachers' and admins' lesson panel. The same component serves /teach (teachers, and admins who
 * also teach) and /admin/lessons (admins); `role` only decides which tabs are there, the server
 * decides what each person may actually do. */
export function StaffLessons({ role }: { role: "admin" | "teacher" }) {
  const { user } = useAuth();
  const { data: studySettings } = useStudySettingsContext();
  const { showToast } = useToast();

  const tz = resolveTimeZone(studySettings);
  const todayKey = useLocalToday(tz);
  const clockOffsetMs = useServerClockOffset();
  const nowMs = useClientClock(30_000, { offsetMs: clockOffsetMs });

  const [tab, setTab] = useState<Tab>("schedule");
  const [anchor, setAnchor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const anchorKey = anchor ?? todayKey;
  // Three weeks around the one on screen, like the student's page: the arrows then rarely wait.
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
  const overviewState = useStaffOverview(user, range);
  const studentsState = useStaffStudents(user);
  const { refetch: refetchOverview } = overviewState;
  const { refetch: refetchStudents } = studentsState;

  const result = overviewState.data && range && overviewState.data.from === range.from && overviewState.data.to === range.to ? overviewState.data : null;
  const overview = result?.overview ?? null;
  const todayNy = nowMs === null ? null : localDateKey(nowMs, NY_TZ);

  const act: Act = useCallback(
    async (task, success) => {
      setBusy(true);
      try {
        const done = (await task()) as { warning?: string } | undefined;
        const warning = done && typeof done === "object" ? done.warning : undefined;
        showToast(warning ?? success, warning ? "info" : "success");
        await Promise.all([refetchOverview(), refetchStudents()]);
        return true;
      } catch (err) {
        showToast(lessonErrorMessage(err), "error");
        if (err instanceof LessonsApiError && STALE_SCHEDULE_CODES.has(err.code)) await refetchOverview();
        return false;
      } finally {
        setBusy(false);
      }
    },
    [refetchOverview, refetchStudents, showToast]
  );

  const week = anchorKey ? weekRange(anchorKey, 1, tz) : null;
  const move = (days: number) => {
    if (anchorKey) setAnchor(addDaysKey(anchorKey, days));
  };
  const isCurrent = anchor === null || (todayKey !== null && weekRange(todayKey, 1, tz).startKey === week?.startKey);
  const selected: StaffOccurrence | null = selectedKey && overview ? (overview.occurrences.find((o) => `${o.class_id}|${o.ny_date}` === selectedKey) ?? null) : null;

  const tabs = [
    { value: "schedule" as const, label: "Schedule" },
    ...(role === "admin" ? [{ value: "classes" as const, label: "Classes" }] : []),
    { value: "students" as const, label: "Students" },
    ...(role === "admin" ? [{ value: "vacations" as const, label: "Vacations" }] : []),
  ];

  let body;
  if (tab === "students") {
    body = (
      <StudentsTab
        students={studentsState.data}
        loading={studentsState.status === "loading"}
        error={studentsState.error}
        overview={overview}
        role={role}
        tz={tz}
        busy={busy}
        act={act}
      />
    );
  } else if (overviewState.status === "error" && !overview) {
    body = (
      <div className="mx-auto max-w-md rounded-2xl border border-border-soft bg-bg-cards p-6 text-center">
        <p className="mb-4 text-[0.92rem] text-text-muted">{overviewState.error ?? "Couldn't load the lessons."}</p>
        <Button size="sm" variant="secondary" onClick={() => void refetchOverview()}>Try again</Button>
      </div>
    );
  } else if (!overview || nowMs === null || !anchorKey || todayKey === null || todayNy === null) {
    body = <Skeleton className="h-64 w-full" />;
  } else if (tab === "classes") {
    body = <ClassesTab overview={overview} todayNy={todayNy} busy={busy} act={act} />;
  } else if (tab === "vacations") {
    body = <VacationsTab overview={overview} todayNy={todayNy} busy={busy} act={act} />;
  } else {
    body = (
      <>
        <LessonsToolbar
          view="week"
          onViewChange={() => {}}
          showViewSwitch={false}
          label={week ? formatWeekLabel(week) : ""}
          onPrev={() => move(-7)}
          onNext={() => move(7)}
          onToday={() => setAnchor(null)}
          isCurrent={isCurrent}
          tz={tz}
          nowMs={nowMs}
        />
        <StaffSchedule overview={overview} tz={tz} nowMs={nowMs} todayKey={todayKey} anchorKey={anchorKey} onOpen={(o) => setSelectedKey(`${o.class_id}|${o.ny_date}`)} />
        {selected ? (
          <OccurrenceDialog
            key={selectedKey}
            occ={selected}
            overview={overview}
            students={studentsState.data}
            tz={tz}
            nowMs={nowMs}
            busy={busy}
            act={act}
            onClose={() => setSelectedKey(null)}
          />
        ) : null}
      </>
    );
  }

  return (
    <div>
      <PageHeader
        title={role === "admin" ? "Lessons" : "Teaching"}
        subtitle={role === "admin" ? "Classes, teachers, vacations and who can book lessons." : "Your classes and students."}
      />
      {role === "admin" && !isLessonsEnabled() ? (
        <p className="mb-5 rounded-xl border border-accent-gold/30 bg-accent-gold/[0.06] p-3 text-[0.84rem] leading-normal">
          Students can&rsquo;t see the Lessons link in their menu yet (it is switched on at build time with <code>NEXT_PUBLIC_LESSONS</code>). The page itself already works for anyone who opens <code>/lessons</code>.
        </p>
      ) : null}
      <div className="mb-5">
        <PillSelector variant="tabs" active={tab} onChange={setTab} options={tabs} />
      </div>
      {body}
    </div>
  );
}
