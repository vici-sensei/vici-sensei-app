-- Run this manually in DBeaver or the Supabase SQL editor.
-- Requires 20260819_scheduled_account_deletion.sql to already be applied.
--
-- pending_deletion_at alone doesn't stop anything -- a still-valid session
-- (up to jwt_expiry=3600s, or a second device that was never signed out)
-- could keep reading and writing normally. This closes that gap at the RLS
-- layer so a pending-deletion account is fully locked: no reads, no writes,
-- from anyone or anything using the normal authenticated/anon roles.
--
-- None of user_kanji_meaning_progress / user_kanji_reading_progress /
-- user_vocabulary_progress / review_logs / study_sessions / user_study_settings's
-- RPCs (get_due_cards, end_study_session, get_level_progress, get_retention_rate,
-- get_review_activity, get_review_streak, get_new_kanji_candidates,
-- get_new_vocab_candidates) are SECURITY DEFINER, so they run with the caller's
-- own privileges -- tightening RLS here is enough to lock all of them too,
-- with no changes needed to those functions themselves.

-- security definer + stable so it always sees the real pending_deletion_at
-- state, even for the users row's own SELECT policy below (which we're about
-- to make conditional on that same column) -- a plain subquery from another
-- table's policy would otherwise see zero rows once a user's own row becomes
-- RLS-invisible to them, making the "is it pending?" check unobservable and
-- silently granting access instead of denying it.
create or replace function public.account_is_active(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select not exists (
    select 1 from public.users where id = p_user_id and pending_deletion_at is not null
  );
$$;

grant execute on function public.account_is_active(uuid) to authenticated;

-- public.users: direct column reference, not a subquery, so this is safe to
-- tighten without going through account_is_active().
alter policy "Users can view their own profile." on public.users
  using ((( select auth.uid() ) = id) and pending_deletion_at is null);

alter policy "Allow individual updates to own profile" on public.users
  using ((( select auth.uid() ) = id) and pending_deletion_at is null)
  with check ((( select auth.uid() ) = id) and pending_deletion_at is null);

alter policy "Users manage own review_logs" on public.review_logs
  using ((( select auth.uid() ) = user_id) and public.account_is_active(user_id))
  with check ((( select auth.uid() ) = user_id) and public.account_is_active(user_id));

alter policy "Users manage own study_sessions" on public.study_sessions
  using ((( select auth.uid() ) = user_id) and public.account_is_active(user_id))
  with check ((( select auth.uid() ) = user_id) and public.account_is_active(user_id));

alter policy "Users manage own user_kanji_meaning_progress" on public.user_kanji_meaning_progress
  using ((( select auth.uid() ) = user_id) and public.account_is_active(user_id))
  with check ((( select auth.uid() ) = user_id) and public.account_is_active(user_id));

alter policy "Users manage own user_kanji_reading_progress" on public.user_kanji_reading_progress
  using ((( select auth.uid() ) = user_id) and public.account_is_active(user_id))
  with check ((( select auth.uid() ) = user_id) and public.account_is_active(user_id));

alter policy "Users manage own user_vocabulary_progress" on public.user_vocabulary_progress
  using ((( select auth.uid() ) = user_id) and public.account_is_active(user_id))
  with check ((( select auth.uid() ) = user_id) and public.account_is_active(user_id));

alter policy "Users manage own user_study_settings" on public.user_study_settings
  using ((( select auth.uid() ) = user_id) and public.account_is_active(user_id))
  with check ((( select auth.uid() ) = user_id) and public.account_is_active(user_id));

-- reroll_leaderboard_alias() is SECURITY DEFINER and writes via auth.uid()
-- directly rather than a client-supplied parameter, so it bypasses the
-- user_study_settings policy above entirely -- it needs its own guard.
create or replace function public.reroll_leaderboard_alias()
 returns table(adjective text, noun text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_alias_id bigint;
begin
  if not public.account_is_active(auth.uid()) then
    return;
  end if;

  select id into v_alias_id
  from public.leaderboard_aliases
  order by random()
  limit 1;

  update public.user_study_settings
  set leaderboard_alias_id = v_alias_id,
      updated_at = now()
  where user_id = auth.uid();

  return query
    select a.adjective, a.noun
    from public.leaderboard_aliases a
    where a.id = v_alias_id;
end;
$function$
;
