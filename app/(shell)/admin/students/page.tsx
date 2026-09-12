"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useRequireAdmin } from "@/lib/auth/useRequireAdmin";
import { useStudentRoster } from "@/lib/client-data/adminStudents";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { Skeleton } from "@/app/components/ui/Skeleton";
import type { StudentRosterRow } from "@/lib/types";

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function formatLastActive(date: string | null): string {
  if (!date) return "Never";
  return dateFormatter.format(new Date(date));
}

function matchesQuery(student: StudentRosterRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (student.display_name ?? "").toLowerCase().includes(q) || student.email.toLowerCase().includes(q);
}

export default function AdminStudentsPage() {
  const { user } = useAuth();
  const { ready, checking } = useRequireAdmin();
  const { data: students, status } = useStudentRoster(ready ? user : null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => (students ?? []).filter((s) => matchesQuery(s, query)), [students, query]);

  if (checking || !ready) return <FullScreenLoader />;

  return (
    <div>
      <h1 className="mb-2 text-[2.1rem] font-extrabold leading-[1.2] tracking-[-0.8px] text-center md:text-left">Students</h1>
      <p className="mb-5 text-base leading-[1.6] text-text-muted text-center md:text-left">
        Your students&apos; progress and activity.
      </p>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by name or email..."
        className="mb-5 w-full max-w-sm rounded-xl border border-border-soft bg-bg-cards px-4 py-2.5 text-sm outline-none placeholder:text-text-muted focus:border-accent-red/50"
      />

      <GlassCard padding="sm" className="overflow-x-auto">
        <table className="w-full min-w-150 break-words text-left text-sm">
          <thead>
            <tr className="border-b border-border-soft text-text-muted">
              <th className="px-3 py-2.5 font-semibold">Name</th>
              <th className="px-3 py-2.5 font-semibold">Last active</th>
              <th className="px-3 py-2.5 font-semibold">Streak</th>
              <th className="px-3 py-2.5 font-semibold">Reviews</th>
              <th className="px-3 py-2.5 font-semibold">Joined</th>
            </tr>
          </thead>
          <tbody>
            {status === "loading" &&
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-border-soft/50">
                  <td className="px-3 py-3" colSpan={5}>
                    <Skeleton className="h-5 w-full" />
                  </td>
                </tr>
              ))}
            {status === "error" && (
              <tr>
                <td className="px-3 py-6 text-center text-text-muted" colSpan={5}>
                  Failed to load student list.
                </td>
              </tr>
            )}
            {status === "loaded" && filtered.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-text-muted" colSpan={5}>
                  {students?.length === 0 ? "No students yet." : "No results."}
                </td>
              </tr>
            )}
            {status === "loaded" &&
              filtered.map((student) => (
                <tr key={student.id} className="border-b border-border-soft/50 last:border-0 hover:bg-white/[0.03]">
                  <td className="max-w-[220px] break-words px-3 py-3">
                    <Link href={`/admin/students/detail?id=${student.id}`} className="font-semibold hover:underline">
                      {student.display_name || student.email}
                    </Link>
                  </td>
                  <td className="px-3 py-3 text-text-muted">{formatLastActive(student.last_active_date)}</td>
                  <td className="px-3 py-3">{student.current_streak}</td>
                  <td className="px-3 py-3">{student.reviews_count}</td>
                  <td className="px-3 py-3 text-text-muted">{dateFormatter.format(new Date(student.created_at))}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </GlassCard>
    </div>
  );
}
