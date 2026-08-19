import type { AppSupabaseClient } from '../supabase/types'
import { PROGRESS_TABLES } from './progressTables'
import { utcDayBounds } from './day'

const PROGRESS_TABLE_NAMES = Object.values(PROGRESS_TABLES).map((t) => t.table)

export interface NextDue {
  next_due_at: string | null
  next_due_is_today: boolean
}

/** Earliest due_at across all progress tables that's still in the future, and whether it falls before today's (local, if `timezone` given) day-end. */
export async function getNextDue(
  supabase: AppSupabaseClient,
  userId: string,
  nowIso: string,
  timezone?: string
): Promise<{ data: NextDue; error: null } | { data: null; error: string }> {
  const results = await Promise.all(
    PROGRESS_TABLE_NAMES.map((table) =>
      supabase
        .from(table)
        .select('due_at')
        .eq('user_id', userId)
        .gt('due_at', nowIso)
        .neq('status', 'suspended')
        .order('due_at', { ascending: true })
        .limit(1)
        .maybeSingle()
    )
  )
  for (const result of results) {
    if (result.error) return { data: null, error: result.error.message }
  }

  const nextDueAt =
    results
      .map((r) => (r.data as { due_at: string } | null)?.due_at ?? null)
      .filter((v): v is string => v !== null)
      .sort((a, b) => Date.parse(a) - Date.parse(b))[0] ?? null

  const { end: todayEnd } = utcDayBounds(new Date(), timezone)
  const nextDueIsToday = nextDueAt !== null && Date.parse(nextDueAt) < Date.parse(todayEnd)

  return { data: { next_due_at: nextDueAt, next_due_is_today: nextDueIsToday }, error: null }
}
