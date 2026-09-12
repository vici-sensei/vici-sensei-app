import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { StudentRosterRow } from "@/lib/types";

interface RawStats {
  current_streak: number;
  longest_streak: number;
  last_active_date: string | null;
  reviews_count: number;
  xp_points: number;
}

interface RawRosterRow {
  id: string;
  display_name: string | null;
  email: string;
  avatar_url: string | null;
  country: string | null;
  is_premium: boolean;
  admin: boolean;
  created_at: string;
  leaderboard_stats: RawStats | RawStats[] | null;
}

// PostgREST's shape for a reverse embed (leaderboard_stats.user_id -> users.id) varies by
// whether it recognizes the relationship as to-one -- normalize both shapes rather than
// depending on that detection.
function normalizeStats(raw: RawStats | RawStats[] | null): RawStats | null {
  return Array.isArray(raw) ? (raw[0] ?? null) : raw;
}

export async function fetchStudentRoster(supabase: AppSupabaseClient): Promise<StudentRosterRow[]> {
  const { data, error } = await supabase
    .from("users")
    .select(
      "id, display_name, email, avatar_url, country, is_premium, admin, created_at, leaderboard_stats(current_streak, longest_streak, last_active_date, reviews_count, xp_points)"
    );

  if (error) throw new Error(error.message);

  const rows = (data as unknown as RawRosterRow[])
    .filter((row) => !row.admin)
    .map((row) => {
      const stats = normalizeStats(row.leaderboard_stats);
      return {
        id: row.id,
        display_name: row.display_name,
        email: row.email,
        avatar_url: row.avatar_url,
        country: row.country,
        is_premium: row.is_premium,
        created_at: row.created_at,
        current_streak: stats?.current_streak ?? 0,
        longest_streak: stats?.longest_streak ?? 0,
        last_active_date: stats?.last_active_date ?? null,
        reviews_count: stats?.reviews_count ?? 0,
        xp_points: stats?.xp_points ?? 0,
      };
    });

  // Most-quiet-first (never-active sorts as "" which precedes any ISO date) -- that's who the
  // teacher actually needs to see.
  return rows.sort((a, b) => (a.last_active_date ?? "").localeCompare(b.last_active_date ?? ""));
}
