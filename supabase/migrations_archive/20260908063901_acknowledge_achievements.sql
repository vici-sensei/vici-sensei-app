-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Lets the client durably track which earned achievements the student has already been shown the
-- celebratory unlock modal for, replacing the sessionStorage-based queue
-- (lib/study/newAchievements.ts) that fed /study/summary's NewAchievementsModal. That queue lived
-- only in sessionStorage, so closing the tab (or the whole browser) before finishing a session lost
-- it for good -- the achievement itself stayed earned (user_achievements is permanent, see
-- 20260924_kana_achievements.sql), but the student never got the popup for it. acknowledged_at null
-- now means exactly "earned but not yet shown"; it survives closed tabs, new devices, anything.

alter table public.user_achievements
  add column acknowledged_at timestamptz null;

-- Backfill: every achievement earned before this migration already had its moment (the old
-- per-review/end-of-session modal, or simply the fact that the student learned hiragana/whatever
-- long before this feature existed) -- treat all of them as already-seen using their own
-- earned_at, not null, so an existing student's next summary visit doesn't suddenly dump every
-- achievement they've ever earned into one modal. Only achievements awarded by award_achievement
-- from this point forward start out null (see that function -- its insert never sets
-- acknowledged_at) and are genuinely new pending unlocks.
update public.user_achievements
  set acknowledged_at = earned_at
  where acknowledged_at is null;

-- Powers "which of this student's achievements still need the unlock modal" (acknowledged_at is
-- null) -- same reasoning as idx_users_pending_deletion_at (20260819_scheduled_account_
-- deletion.sql): almost every row will have this set once seen, so a partial index keeps it cheap.
create index idx_user_achievements_unacknowledged
  on public.user_achievements using btree (user_id)
  where acknowledged_at is null;

-- security definer, same pattern as cancel_pending_account_deletion
-- (20260819_scheduled_account_deletion.sql): user_achievements deliberately has no UPDATE policy
-- for authenticated (see 20260924_kana_achievements.sql's "only written by award_achievement"
-- comment), so acknowledging stays a narrow, single-purpose write instead of a general column
-- grant. Scoped to the caller's own rows via auth.uid() rather than a p_user_id parameter, so it
-- can never be pointed at another student's achievements. p_keys is exactly the set of keys the
-- client just displayed in the modal -- not "everything currently unacknowledged" -- so an
-- achievement earned in the gap between the fetch and this call (a second tab, a background sync)
-- is never silently marked seen without actually having been shown.
create or replace function public.acknowledge_achievements(p_keys text[])
returns void
language sql
security definer
set search_path = public
as $$
  update public.user_achievements
  set acknowledged_at = now()
  where user_id = auth.uid()
    and achievement_key = any(p_keys)
    and acknowledged_at is null;
$$;

grant execute on function public.acknowledge_achievements(text[]) to authenticated;
