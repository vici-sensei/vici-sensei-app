import type { AppSupabaseClient } from '../supabase/types'

export interface NextDue {
  next_due_at: string | null
  next_due_is_today: boolean
}

/** Earliest due_at across all progress tables that's still in the future, and whether it falls before today's (local, if `timezone` given) day-end -- computed entirely server-side via the get_next_due RPC (now()/p_timezone), never from the client's own clock. */
export async function getNextDue(
  supabase: AppSupabaseClient,
  userId: string,
  timezone?: string
): Promise<{ data: NextDue; error: null } | { data: null; error: string }> {
  const { data, error } = await supabase
    .rpc('get_next_due', { p_user_id: userId, p_timezone: timezone ?? 'UTC' })
    .single()

  if (error) return { data: null, error: error.message }
  return { data: data as NextDue, error: null }
}
