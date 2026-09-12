"use client";

import { Fragment, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { FaChevronDown, FaChevronRight, FaCheck, FaXmark } from "react-icons/fa6";
import { useRequireAdmin } from "@/lib/auth/useRequireAdmin";
import {
  useStudentAchievements,
  useStudentDailyActivity,
  useStudentDetail,
  useStudentProgressSummary,
  useStudentTestResults,
} from "@/lib/client-data/adminStudentDetail";
import { fetchStudentReviewLogsForDay } from "@/lib/data/adminStudentDetail";
import { createClient } from "@/lib/supabase/client";
import { ACHIEVEMENT_CATALOG } from "@/lib/achievements/registry";
import { PROGRESS_STATUSES, type ProgressStatus } from "@/lib/srs/constants";
import type { ProgressStatusCounts, ProgressSummaryResponse, StudentReviewLogEntry } from "@/lib/types";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { Badge } from "@/app/components/ui/Badge";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { ActivityHeatmap } from "./ActivityHeatmap";

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

const STATUS_COLORS: Record<ProgressStatus, string> = {
  new: "var(--color-text-muted)",
  learning: "var(--color-accent-blue)",
  review: "var(--color-accent-gold)",
  relearning: "var(--color-accent-red)",
  suspended: "#6b7280",
};

const STATUS_LABELS: Record<ProgressStatus, string> = {
  new: "New",
  learning: "Learning",
  review: "Review",
  relearning: "Relearning",
  suspended: "Suspended",
};

const KNOWLEDGE_BLOCKS: { key: keyof ProgressSummaryResponse; title: string }[] = [
  { key: "kanji_meaning", title: "Kanji meaning" },
  { key: "kanji_reading", title: "Kanji reading" },
  { key: "vocab_meaning", title: "Vocabulary" },
  { key: "hiragana_reading", title: "Hiragana" },
  { key: "katakana_reading", title: "Katakana" },
];

function total(counts: ProgressStatusCounts): number {
  return PROGRESS_STATUSES.reduce((sum, s) => sum + counts[s], 0);
}

function dayLabel(day: string): { start: string; end: string } {
  const start = `${day}T00:00:00.000Z`;
  const end = new Date(new Date(start).getTime() + 24 * 60 * 60 * 1000).toISOString();
  return { start, end };
}

function reviewItemLabel(entry: StudentReviewLogEntry): string {
  if (entry.kanji) return entry.kanji.kanji;
  if (entry.word) return entry.word.kana_reading ? `${entry.word.word} (${entry.word.kana_reading})` : entry.word.word;
  if (entry.hiragana) return entry.hiragana.character;
  if (entry.katakana) return entry.katakana.character;
  return entry.exercise_type;
}

function AdminStudentDetailContent({ studentId }: { studentId: string }) {
  const { ready, checking } = useRequireAdmin();

  const { data: student, status: studentStatus } = useStudentDetail(ready ? studentId : null);
  const { data: dailyActivity, status: activityStatus } = useStudentDailyActivity(ready ? studentId : null);
  const { data: knowledge } = useStudentProgressSummary(ready ? studentId : null);
  const { data: testResults, status: testStatus } = useStudentTestResults(ready ? studentId : null);
  const { data: achievements } = useStudentAchievements(ready ? studentId : null);

  const [expandedDay, setExpandedDay] = useState<string | null>(null);
  const [dayEntries, setDayEntries] = useState<Record<string, StudentReviewLogEntry[]>>({});
  const [loadingDay, setLoadingDay] = useState<string | null>(null);

  async function toggleDay(day: string) {
    if (expandedDay === day) {
      setExpandedDay(null);
      return;
    }
    setExpandedDay(day);
    if (!dayEntries[day]) {
      setLoadingDay(day);
      const { start, end } = dayLabel(day);
      const entries = await fetchStudentReviewLogsForDay(createClient(), studentId, start, end);
      setDayEntries((prev) => ({ ...prev, [day]: entries }));
      setLoadingDay(null);
    }
  }

  if (checking || !ready) return <FullScreenLoader />;

  if (studentStatus === "loaded" && !student) {
    return (
      <div>
        <p className="text-text-muted">Student not found.</p>
        <Link href="/admin/students" className="text-accent-red hover:underline">
          Back to list
        </Link>
      </div>
    );
  }

  const daysWithActivity = (dailyActivity ?? []).slice(0, 90);
  const knowledgeBlocks = KNOWLEDGE_BLOCKS.filter((b) => knowledge?.[b.key] && total(knowledge[b.key]) > 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/admin/students" className="mb-3 inline-block text-sm text-text-muted hover:text-white">
          ← All students
        </Link>
        <h1 className="text-[2.1rem] font-extrabold leading-[1.2] tracking-[-0.8px]">
          {student?.display_name || student?.email || <Skeleton className="h-9 w-48" />}
        </h1>
      </div>

      {/* Overview */}
      <GlassCard>
        {!student ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 md:grid-cols-6">
            <div>
              <div className="text-xs text-text-muted">Email</div>
              <div className="font-semibold">{student.email}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted">Joined</div>
              <div className="font-semibold">{dateFormatter.format(new Date(student.created_at))}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted">Current streak</div>
              <div className="font-semibold">{student.current_streak} days</div>
            </div>
            <div>
              <div className="text-xs text-text-muted">Longest streak</div>
              <div className="font-semibold">{student.longest_streak} days</div>
            </div>
            <div>
              <div className="text-xs text-text-muted">Last active</div>
              <div className="font-semibold">
                {student.last_active_date ? dateFormatter.format(new Date(student.last_active_date)) : "Never"}
              </div>
            </div>
            <div>
              <div className="text-xs text-text-muted">Accuracy (30 days)</div>
              <div className="font-semibold">
                {student.retention_rate == null ? "—" : `${Math.round(student.retention_rate * 100)}%`}
              </div>
            </div>
            <div>
              <div className="text-xs text-text-muted">Study track</div>
              <div className="font-semibold capitalize">{student.study_track ?? "—"}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted">JLPT levels</div>
              <div className="font-semibold">{student.enabled_levels.join(", ") || "—"}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted">Daily targets</div>
              <div className="font-semibold">
                {student.study_track === "kana"
                  ? `${student.new_hiragana_per_day ?? 0}H / ${student.new_katakana_per_day ?? 0}K new`
                  : `${student.new_kanji_per_day ?? 0}漢 / ${student.new_vocab_per_day ?? 0}語 new`}
                {" · "}
                {student.max_reviews_per_day ?? 0} max reviews
              </div>
            </div>
            {student.pending_deletion_at && (
              <div className="col-span-full">
                <Badge color="red">Account pending deletion</Badge>
              </div>
            )}
          </div>
        )}
      </GlassCard>

      {/* Daily activity */}
      <section>
        <h2 className="mb-3 text-lg font-bold">Daily activity</h2>
        <GlassCard>
          {activityStatus === "loading" ? (
            <Skeleton className="h-24 w-full" />
          ) : (
            <>
              <ActivityHeatmap days={dailyActivity ?? []} />
              <div className="mt-5 max-h-96 overflow-y-auto">
                <table className="w-full break-words text-left text-sm">
                  <thead>
                    <tr className="border-b border-border-soft text-text-muted">
                      <th className="w-6 px-2 py-2" />
                      <th className="px-2 py-2 font-semibold">Date</th>
                      <th className="px-2 py-2 font-semibold">Reviews</th>
                      <th className="px-2 py-2 font-semibold">New items</th>
                      <th className="px-2 py-2 font-semibold">XP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {daysWithActivity.length === 0 && (
                      <tr>
                        <td className="px-2 py-4 text-center text-text-muted" colSpan={5}>
                          No activity yet.
                        </td>
                      </tr>
                    )}
                    {daysWithActivity.map((day) => (
                      <Fragment key={day.day}>
                        <tr
                          onClick={() => toggleDay(day.day)}
                          className="cursor-pointer border-b border-border-soft/50 hover:bg-white/[0.03]"
                        >
                          <td className="px-2 py-2 text-text-muted">
                            {expandedDay === day.day ? <FaChevronDown /> : <FaChevronRight />}
                          </td>
                          <td className="px-2 py-2">{dateFormatter.format(new Date(day.day))}</td>
                          <td className="px-2 py-2">{day.reviews_count}</td>
                          <td className="px-2 py-2">{day.new_cards_count}</td>
                          <td className="px-2 py-2 text-text-muted">{day.xp_points}</td>
                        </tr>
                        {expandedDay === day.day && (
                          <tr className="border-b border-border-soft/50 bg-white/[0.02]">
                            <td colSpan={5} className="px-4 py-3">
                              {loadingDay === day.day ? (
                                <Skeleton className="h-5 w-full" />
                              ) : (
                                <div className="flex flex-wrap gap-2">
                                  {(dayEntries[day.day] ?? []).length === 0 ? (
                                    <span className="text-sm text-text-muted">No review details for this day.</span>
                                  ) : (
                                    (dayEntries[day.day] ?? []).map((entry) => (
                                      <span
                                        key={entry.id}
                                        className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-sm ${
                                          entry.correct
                                            ? "border-accent-blue/25 bg-accent-blue/[0.06]"
                                            : "border-accent-red/25 bg-accent-red/[0.06]"
                                        }`}
                                      >
                                        {entry.correct ? (
                                          <FaCheck className="h-3 w-3 text-accent-blue" />
                                        ) : (
                                          <FaXmark className="h-3 w-3 text-accent-red" />
                                        )}
                                        {reviewItemLabel(entry)}
                                      </span>
                                    ))
                                  )}
                                </div>
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </GlassCard>
      </section>

      {/* Knowledge */}
      <section>
        <h2 className="mb-3 text-lg font-bold">What they know</h2>
        {!knowledge ? (
          <GlassCard>
            <Skeleton className="h-20 w-full" />
          </GlassCard>
        ) : knowledgeBlocks.length === 0 ? (
          <GlassCard>
            <p className="text-text-muted">No progress yet.</p>
          </GlassCard>
        ) : (
          <div className="flex flex-col gap-3">
            {knowledgeBlocks.map((block) => {
              const counts = knowledge[block.key];
              const blockTotal = total(counts);
              return (
                <GlassCard key={block.key} padding="sm">
                  <div className="mb-2 flex flex-wrap items-center gap-3">
                    <h3 className="m-0 font-bold">{block.title}</h3>
                    <span className="text-sm text-text-muted">{blockTotal} total</span>
                  </div>
                  <div className="mb-2.5 flex h-3 overflow-hidden rounded-lg bg-white/[0.04]">
                    {PROGRESS_STATUSES.map((status) => {
                      const pct = blockTotal > 0 ? (counts[status] / blockTotal) * 100 : 0;
                      return <div key={status} style={{ width: `${pct}%`, background: STATUS_COLORS[status] }} />;
                    })}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-text-muted">
                    {PROGRESS_STATUSES.map((status) => (
                      <span key={status} className="flex items-center gap-1.5">
                        <span className="h-2 w-2 rounded-full" style={{ background: STATUS_COLORS[status] }} />
                        {STATUS_LABELS[status]} <b className="text-white">{counts[status]}</b>
                      </span>
                    ))}
                  </div>
                </GlassCard>
              );
            })}
          </div>
        )}
      </section>

      {/* Tests */}
      <section>
        <h2 className="mb-3 text-lg font-bold">Tests</h2>
        <GlassCard padding="sm">
          {testStatus === "loading" ? (
            <Skeleton className="h-16 w-full" />
          ) : (testResults ?? []).length === 0 ? (
            <p className="p-2 text-text-muted">No tests taken yet.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {(testResults ?? []).map((result) => (
                <div
                  key={result.id}
                  className="flex items-center justify-between border-b border-border-soft/50 px-2 py-2.5 last:border-0"
                >
                  <div>
                    <span className="font-semibold capitalize">{result.test_type}</span>
                    <span className="ml-2 text-sm text-text-muted">attempt #{result.attempt_number}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm text-text-muted">{dateFormatter.format(new Date(result.earned_at))}</span>
                    <Badge color={result.percent >= 80 ? "blue" : result.percent >= 50 ? "gold" : "red"}>
                      {result.percent}%
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </GlassCard>
      </section>

      {/* Achievements */}
      {achievements && achievements.length > 0 && (
        <section>
          <h2 className="mb-3 text-lg font-bold">Achievements</h2>
          <div className="flex flex-wrap gap-2">
            {achievements.map((a) => {
              const entry = ACHIEVEMENT_CATALOG.find((c) => c.achievementKey === a.achievement_key);
              return (
                <span
                  key={a.achievement_key}
                  title={dateFormatter.format(new Date(a.earned_at))}
                  className="inline-flex items-center gap-2 rounded-lg border border-accent-gold/25 bg-accent-gold/[0.06] px-3 py-1.5 text-sm"
                >
                  {entry?.icon ? <entry.icon className="h-4 w-4 text-accent-gold" /> : null}
                  {entry?.title ?? a.achievement_key}
                </span>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function AdminStudentDetailFromQuery() {
  const searchParams = useSearchParams();
  const studentId = searchParams.get("id");
  if (!studentId) {
    return (
      <div>
        <p className="text-text-muted">No student selected.</p>
        <Link href="/admin/students" className="text-accent-red hover:underline">
          Back to list
        </Link>
      </div>
    );
  }
  return <AdminStudentDetailContent studentId={studentId} />;
}

export default function AdminStudentDetailPage() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <AdminStudentDetailFromQuery />
    </Suspense>
  );
}
