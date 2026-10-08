import type { Env } from "./env";
import { releaseGoogleCalendar } from "./googleCalendarCore";
import { callWriter } from "./lessonsWriter";
import { pgSelectAll } from "./postgrest";
import { isRegion, type Region } from "./region";
import { serviceConfig } from "./supabaseAdmin";

/**
 * What happens to a person's lessons when their ACCOUNT changes (docs/LESSON_BOOKING_PLAN.md, sections 2 and 13).
 * The writer knows people only as (region, user id), and both can change under it:
 *
 *  - a region move creates a new account with a new id, maybe in the other region: rekeyLessons() carries the
 *    student's seats, waitlist, notifications and devices (and a teacher's classes) over, as part of the move's
 *    "update_ledger" step;
 *  - an account that is deleted, or is waiting out its 30 days before deletion, must not keep a seat:
 *    sweepLessonAccounts() runs weekly and frees them.
 */

export interface MovedAccount {
  source_region: Region;
  source_user_id: string;
  target_region: Region;
  target_user_id: string;
}

export interface RekeyReport {
  student: boolean;
  classes: number;
  overrides: number;
  vacations: number;
}

/** Idempotent (the step that calls it is retried until it succeeds): a second call finds nothing left to move.
 * Throws when the writer refuses or cannot be reached, so the step is retried instead of leaving the person's
 * lessons behind under a key that no longer exists. */
export async function rekeyLessons(env: Env, move: MovedAccount): Promise<RekeyReport> {
  const result = await callWriter(env, "lesson_rekey_student", {
    p_old_region: move.source_region,
    p_old_id: move.source_user_id,
    p_new_region: move.target_region,
    p_new_id: move.target_user_id,
  });
  if (!result.ok) throw new Error(`lesson_rekey_student: ${result.code}`);
  return result.data as RekeyReport;
}

const MAX_REMOVALS_PER_RUN = 50;
const CHUNK = 80;

interface StudentKey {
  region: string;
  user_id: string;
  access: boolean;
}

export interface LessonSweepReport {
  checked: number;
  /** The account is gone: everything of theirs is deleted. */
  deleted: number;
  /** The account is waiting to be deleted: its seats are freed, its data kept until then. */
  freed: number;
  /** Regions whose users could not be read this time (nothing is removed for them). */
  skipped: Region[];
}

/** Compares every student the writer knows with the users table of the region it lives in. Never removes
 * anyone it could not positively check: a region whose lookup fails is skipped for this run. */
export async function sweepLessonAccounts(env: Env): Promise<LessonSweepReport> {
  const report: LessonSweepReport = { checked: 0, deleted: 0, freed: 0, skipped: [] };
  const keys = await callWriter(env, "lesson_list_student_keys", {});
  if (!keys.ok) throw new Error(`lesson_list_student_keys: ${keys.code}`);

  const byRegion = new Map<Region, StudentKey[]>();
  for (const key of (Array.isArray(keys.data) ? keys.data : []) as StudentKey[]) {
    if (!isRegion(key.region)) continue;
    byRegion.set(key.region, [...(byRegion.get(key.region) ?? []), key]);
  }

  let removals = 0;
  for (const [region, students] of byRegion) {
    const seen = new Map<string, string | null>();
    try {
      for (let i = 0; i < students.length; i += CHUNK) {
        const rows = await pgSelectAll<{ id: string; pending_deletion_at: string | null }>(serviceConfig(env, region), "users", {
          id: `in.(${students.slice(i, i + CHUNK).map((s) => s.user_id).join(",")})`,
          select: "id,pending_deletion_at",
        });
        for (const row of rows) seen.set(row.id, row.pending_deletion_at ?? null);
      }
    } catch (err) {
      console.error(`lessons: account sweep (${region}):`, err instanceof Error ? err.message : String(err));
      report.skipped.push(region);
      continue;
    }

    for (const student of students) {
      report.checked += 1;
      if (removals >= MAX_REMOVALS_PER_RUN) continue;
      const gone = !seen.has(student.user_id);
      const leaving = !gone && seen.get(student.user_id) !== null;
      if (!gone && !(leaving && student.access)) continue;
      // Their Google calendar is the app's, not theirs: it goes with the account (before the writer forgets which one it was).
      try {
        await releaseGoogleCalendar(env, region, student.user_id);
      } catch (err) {
        console.error(`lessons: could not delete the Google calendar of ${student.user_id}:`, err instanceof Error ? err.message : String(err));
      }
      const result = await callWriter(env, "lesson_student_removed", { p_region: region, p_user_id: student.user_id, p_hard: gone });
      if (!result.ok) throw new Error(`lesson_student_removed: ${result.code}`);
      removals += 1;
      if (gone) report.deleted += 1;
      else report.freed += 1;
    }
  }
  return report;
}
