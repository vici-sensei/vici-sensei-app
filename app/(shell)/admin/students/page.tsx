"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { FaSliders, FaSort, FaSortDown, FaSortUp } from "react-icons/fa6";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useRequireAdmin } from "@/lib/auth/useRequireAdmin";
import { updateStudentPremium, useStudentRoster } from "@/lib/client-data/adminStudents";
import { useCountries } from "@/lib/client-data/countries";
import { getErrorMessage } from "@/lib/api/client";
import { isMultiRegionEnabled } from "@/lib/supabase/regions";
import { useStudyStats } from "@/lib/study/StudyStatsContext";
import { Breadcrumbs } from "@/app/components/ui/Breadcrumbs";
import { Collapsible } from "@/app/components/ui/Collapsible";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { useToast } from "@/app/components/ui/Toast";
import type { StudentRosterRow } from "@/lib/types";
import { FilterPanel } from "./FilterPanel";
import { ProAccessCell } from "./ProAccessCell";
import {
  activeFilterCount,
  DEFAULT_FILTERS,
  defaultDir,
  filterStudents,
  parseView,
  serializeView,
  sortStudents,
  type RosterFilters,
  type RosterView,
  type SortKey,
} from "./rosterView";

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function formatLastActive(date: string | null): string {
  if (!date) return "Never";
  return dateFormatter.format(new Date(date));
}

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: "pro", label: "Pro" },
  { key: "name", label: "Name" },
  { key: "last_active", label: "Last activity" },
  { key: "streak", label: "Streak" },
  { key: "reviews", label: "Reviews" },
  { key: "new", label: "New" },
  { key: "practice", label: "Practice" },
  { key: "test", label: "Test" },
  { key: "joined", label: "Joined" },
];

type PremiumOverride = Pick<StudentRosterRow, "is_premium" | "premium_until">;

function SortableHeader({
  column,
  view,
  onSort,
}: {
  column: { key: SortKey; label: string };
  view: RosterView;
  onSort: (key: SortKey) => void;
}) {
  const active = view.sort === column.key;
  const Icon = !active ? FaSort : view.dir === "asc" ? FaSortUp : FaSortDown;
  return (
    <th
      className="px-3 py-2.5 font-semibold"
      aria-sort={active ? (view.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(column.key)}
        className={`inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap transition-colors hover:text-white ${
          active ? "text-white" : ""
        }`}
      >
        {column.label}
        <Icon className={`h-3 w-3 ${active ? "text-accent-blue" : "opacity-40"}`} />
      </button>
    </th>
  );
}

function AdminStudents() {
  const { user } = useAuth();
  const { ready, checking } = useRequireAdmin();
  const { data: students, status } = useStudentRoster(ready ? user : null);
  const { data: allCountries } = useCountries();
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const multiRegion = isMultiRegionEnabled();

  // Read from the URL once; from then on local state is the source of truth and each change is
  // written back with replaceState (not pushState -- a filter tweak shouldn't become a Back step).
  const [view, setView] = useState<RosterView>(() => parseView(new URLSearchParams(searchParams.toString())));
  const [filtersOpen, setFiltersOpen] = useState(() => activeFilterCount(view.filters) > 0);
  // Optimistic per-row Pro overrides, same approach as the leads page's contacted toggle -- reverted
  // (with a toast) if the write fails.
  const [overrides, setOverrides] = useState<Record<string, PremiumOverride>>({});
  const [pendingIds, setPendingIds] = useState<Set<string>>(new Set());
  const [deviceNow, setDeviceNow] = useState(() => Date.now());
  // Server time, not the device clock: premium-trial-expiry ends Pro by the server's clock, and
  // formatTimeLeft rounds up, so an admin clock half an hour behind shows a fresh 7-day trial as "8d left".
  const { clockOffsetMs } = useStudyStats();
  const now = deviceNow + clockOffsetMs;

  // Keeps "5d left" and the time-based filters current on a page left open.
  useEffect(() => {
    const timer = setInterval(() => setDeviceNow(Date.now()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const rows = useMemo(
    () => (students ?? []).map((s) => (overrides[s.id] ? { ...s, ...overrides[s.id] } : s)),
    [students, overrides]
  );
  const visible = useMemo(
    () => sortStudents(filterStudents(rows, view, now), view.sort, view.dir, now),
    [rows, view, now]
  );

  const countryOptions = useMemo(() => {
    const names = new Map((allCountries ?? []).map((c) => [c.code, c.name]));
    const present = new Set(rows.map((s) => s.country).filter((c): c is string => c !== null));
    return [...present]
      .map((code) => ({ code, name: names.get(code) ?? code }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, allCountries]);

  if (checking || !ready) return <FullScreenLoader />;

  function updateView(next: RosterView) {
    setView(next);
    const qs = serializeView(next);
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }

  function handleSort(key: SortKey) {
    const dir = view.sort === key ? (view.dir === "asc" ? "desc" : "asc") : defaultDir(key);
    updateView({ ...view, sort: key, dir });
  }

  function handleFilterChange(patch: Partial<RosterFilters>) {
    updateView({ ...view, filters: { ...view.filters, ...patch } });
  }

  async function handlePremiumChange(
    student: StudentRosterRow,
    isPremium: boolean,
    premiumUntil: string | null,
    pickedAt?: number
  ) {
    if (pendingIds.has(student.id)) return;
    // A just-picked end date is measured from the click, but `now` can be up to a minute old --
    // without this, "7 days" reads as 7d + a few seconds away and formatTimeLeft rounds it up to "8d left".
    if (pickedAt !== undefined) setDeviceNow(pickedAt);
    const previous = overrides[student.id];
    setOverrides((prev) => ({
      ...prev,
      [student.id]: { is_premium: isPremium, premium_until: isPremium ? premiumUntil : null },
    }));
    setPendingIds((prev) => new Set(prev).add(student.id));
    try {
      await updateStudentPremium(student.id, isPremium, premiumUntil);
    } catch (err) {
      setOverrides((prev) => {
        const copy = { ...prev };
        if (previous) copy[student.id] = previous;
        else delete copy[student.id];
        return copy;
      });
      showToast(getErrorMessage(err, "Failed to update Pro access."), "error");
    } finally {
      setPendingIds((prev) => {
        const copy = new Set(prev);
        copy.delete(student.id);
        return copy;
      });
    }
  }

  const filterCount = activeFilterCount(view.filters);

  return (
    <div>
      <Breadcrumbs items={[{ label: "Teacher", href: "/admin" }, { label: "Students" }]} />
      <h1 className="mb-2 text-[2.1rem] font-extrabold leading-[1.2] tracking-[-0.8px] text-center md:text-left">Students</h1>
      <p className="mb-5 text-base leading-[1.6] text-text-muted text-center md:text-left">
        Your students&apos; progress and activity.
      </p>

      <div className="flex flex-wrap items-center gap-2.5">
        <input
          type="text"
          value={view.query}
          onChange={(e) => updateView({ ...view, query: e.target.value })}
          placeholder="Search by name or email..."
          className="min-w-0 max-w-sm flex-1 basis-60 rounded-xl border border-border-soft bg-bg-cards px-4 py-2.5 text-sm outline-none placeholder:text-text-muted focus:border-accent-red/50"
        />
        <button
          type="button"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((open) => !open)}
          className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-[0.85rem] font-extrabold transition-all ${
            filtersOpen || filterCount > 0
              ? "border-accent-blue/35 bg-accent-blue/[0.12] text-accent-blue"
              : "border-border-soft bg-white/[0.03] text-text-muted hover:border-white/20"
          }`}
        >
          <FaSliders className="h-3.5 w-3.5" />
          Filters{filterCount > 0 ? ` (${filterCount})` : ""}
        </button>
        {filterCount > 0 ? (
          <button
            type="button"
            onClick={() => updateView({ ...view, filters: DEFAULT_FILTERS })}
            className="cursor-pointer px-1 text-[0.85rem] font-bold text-text-muted hover:text-white"
          >
            Reset
          </button>
        ) : null}
      </div>

      <Collapsible open={filtersOpen} openClassName="mt-4">
        <GlassCard padding="sm">
          <FilterPanel
            filters={view.filters}
            onChange={handleFilterChange}
            countries={countryOptions}
            showRegion={multiRegion}
          />
        </GlassCard>
      </Collapsible>

      <p className="mt-4 mb-2.5 text-sm text-text-muted">
        {status === "loaded" ? `Showing ${visible.length} of ${students?.length ?? 0} students` : " "}
      </p>

      <GlassCard padding="sm" className="overflow-x-auto">
        <table className="w-full min-w-190 break-words text-left text-sm">
          <thead>
            <tr className="border-b border-border-soft text-text-muted">
              {COLUMNS.map((column) => (
                <SortableHeader key={column.key} column={column} view={view} onSort={handleSort} />
              ))}
            </tr>
          </thead>
          <tbody>
            {status === "loading" &&
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-border-soft/50">
                  <td className="px-3 py-3" colSpan={COLUMNS.length}>
                    <Skeleton className="h-5 w-full" />
                  </td>
                </tr>
              ))}
            {status === "error" && (
              <tr>
                <td className="px-3 py-6 text-center text-text-muted" colSpan={COLUMNS.length}>
                  Failed to load student list.
                </td>
              </tr>
            )}
            {status === "loaded" && visible.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-text-muted" colSpan={COLUMNS.length}>
                  {students?.length === 0 ? "No students yet." : "No students match these filters."}
                </td>
              </tr>
            )}
            {status === "loaded" &&
              visible.map((student) => (
                <tr key={student.id} className="border-b border-border-soft/50 last:border-0 hover:bg-white/[0.03]">
                  <td className="px-3 py-3">
                    <ProAccessCell
                      student={student}
                      now={now}
                      pending={pendingIds.has(student.id)}
                      editable={multiRegion}
                      onChange={(isPremium, premiumUntil, pickedAt) =>
                        handlePremiumChange(student, isPremium, premiumUntil, pickedAt)
                      }
                    />
                  </td>
                  <td className="max-w-[220px] break-words px-3 py-3">
                    <Link href={`/admin/students/detail?id=${student.id}`} className="font-semibold hover:underline">
                      {student.display_name || student.email}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-text-muted">{formatLastActive(student.last_active_date)}</td>
                  <td className="px-3 py-3">{student.current_streak}</td>
                  {/* Includes learned_count -- a kana drill graduation is a special kind of
                      review, not a distinct activity type, on this table. */}
                  <td className="px-3 py-3">{student.reviews_count + student.learned_count}</td>
                  <td className="px-3 py-3">{student.new_cards_count}</td>
                  <td className="px-3 py-3">{student.practice_count}</td>
                  <td className="px-3 py-3">{student.test_count}</td>
                  <td className="px-3 py-3 text-text-muted">{dateFormatter.format(new Date(student.created_at))}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </GlassCard>
    </div>
  );
}

export default function AdminStudentsPage() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <AdminStudents />
    </Suspense>
  );
}
