-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Account deletion is no longer instant: requesting it now just stamps
-- pending_deletion_at 30 days out (set by the delete-account Edge Function).
-- A daily cron sweep (see 20260819_process_scheduled_deletions_cron.sql)
-- finalizes accounts whose grace period has elapsed by calling the new
-- process-scheduled-deletions Edge Function. If the user logs back in before
-- then, the auth callback calls cancel_pending_account_deletion() below to
-- clear the flag and keep the account.

alter table public.users
  add column pending_deletion_at timestamptz null;

-- Powers the cron sweep's lookup of accounts whose grace period has elapsed,
-- and the partial index keeps it tiny since almost every row has a null here.
create index idx_users_pending_deletion_at
  on public.users using btree (pending_deletion_at)
  where pending_deletion_at is not null;

-- security definer because authenticated only has column-level UPDATE grants
-- on (display_name, avatar_url, updated_at) -- see 20260730_restrict_users_column_grants.sql.
-- Callable by any logged-in user; scoped to their own row via auth.uid().
create or replace function public.cancel_pending_account_deletion()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  reactivated boolean := false;
begin
  update public.users
  set pending_deletion_at = null
  where id = auth.uid()
    and pending_deletion_at is not null
  returning true into reactivated;

  return coalesce(reactivated, false);
end;
$$;

grant execute on function public.cancel_pending_account_deletion() to authenticated;
