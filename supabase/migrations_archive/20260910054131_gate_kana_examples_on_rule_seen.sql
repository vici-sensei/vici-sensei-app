-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Bug: introduce_hiragana_examples/introduce_katakana_examples introduced entry_kind = 'example'
-- rows (sokuon/yoon/n_gemination/choonpu/extended) purely based on their sort_order position and
-- the day's new_hiragana_per_day/new_katakana_per_day budget -- with no check that the student had
-- actually reached/finished that kana_type's own "new rule" card (introduce_hiragana_rule/
-- introduce_katakana_rule, the only place user_hiragana_rule_progress/user_katakana_rule_progress
-- gets a row). 20260906_kana_examples_skip_intro_card.sql's comment assumed the rule always lands
-- "right before" its examples become due, but nothing in the code enforced that -- and
-- fetchStudyQueue calls introduceHiraganaExamples/introduceKatakanaExamples unconditionally on
-- every queue fetch (including the very first one on /study mount), so an account could get an
-- entire example pack silently marked seen in user_hiragana_progress/user_katakana_progress before
-- ever laying eyes on the rule that explains it. Confirmed live for one account: 6 yoon + 3 sokuon
-- + 1 n_gemination hiragana example rows inserted in one batch on a /study page load with zero
-- cards reviewed that session, while user_hiragana_rule_progress had no row for any of those three
-- kana_types.
--
-- Fix: require a matching *_rule_progress row for the same kana_type before an example row can be
-- introduced. Bodies otherwise unchanged from 20260921_fix_introduce_kana_examples_ambiguous_column.sql.
-- Safe for seion/dakuten/handakuten (hiragana) and seion/dakuten/handakuten (katakana): none of
-- those kana_types have any entry_kind = 'example' rows, so the new condition never applies to them.

create or replace function public.introduce_hiragana_examples(p_user_id uuid, p_timezone text default 'UTC', p_session_id bigint default null)
returns table(hiragana_id bigint)
language plpgsql
as $function$
#variable_conflict use_column
declare
  v_cap integer;
  v_count integer;
  v_remaining integer;
  v_day_start timestamptz;
  v_day_end timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('introduce_hiragana:' || p_user_id::text));

  select day_start, day_end into v_day_start, v_day_end from public.study_day_bounds(p_timezone);

  if not exists (
    select 1 from public.user_study_settings s
    where s.user_id = p_user_id and s.study_track = 'kana' and s.study_hiragana
  ) then
    raise exception 'Hiragana study is not enabled for this user' using errcode = 'P0002';
  end if;

  select new_hiragana_per_day into v_cap
  from public.user_study_settings
  where user_id = p_user_id;

  if v_cap is null then
    raise exception 'No study settings found for user %', p_user_id;
  end if;

  select count(*) into v_count
  from public.user_hiragana_progress
  where user_id = p_user_id
    and created_at >= v_day_start
    and created_at < v_day_end;

  v_remaining := greatest(v_cap - v_count, 0);

  return query
  insert into public.user_hiragana_progress (user_id, hiragana_id, session_id, status, due_at)
  select p_user_id, c.id, p_session_id, 'learning', now()
  from public.get_new_hiragana_candidates(p_user_id, v_remaining) c
  join public.hiragana h on h.id = c.id
  where c.entry_kind = 'example'
    -- NEW: the example's own rule card must already be recorded as seen.
    and exists (
      select 1
      from public.user_hiragana_rule_progress rp
      join public.hiragana r on r.id = rp.hiragana_id
      where rp.user_id = p_user_id and r.kana_type = h.kana_type
    )
  on conflict (user_id, hiragana_id) do nothing
  returning user_hiragana_progress.hiragana_id;
end;
$function$;

create or replace function public.introduce_katakana_examples(p_user_id uuid, p_timezone text default 'UTC', p_session_id bigint default null)
returns table(katakana_id bigint)
language plpgsql
as $function$
#variable_conflict use_column
declare
  v_cap integer;
  v_count integer;
  v_remaining integer;
  v_day_start timestamptz;
  v_day_end timestamptz;
begin
  perform pg_advisory_xact_lock(hashtext('introduce_katakana:' || p_user_id::text));

  select day_start, day_end into v_day_start, v_day_end from public.study_day_bounds(p_timezone);

  if not exists (
    select 1 from public.user_study_settings s
    where s.user_id = p_user_id and s.study_track = 'kana' and s.study_katakana
  ) then
    raise exception 'Katakana study is not enabled for this user' using errcode = 'P0002';
  end if;

  select new_katakana_per_day into v_cap
  from public.user_study_settings
  where user_id = p_user_id;

  if v_cap is null then
    raise exception 'No study settings found for user %', p_user_id;
  end if;

  select count(*) into v_count
  from public.user_katakana_progress
  where user_id = p_user_id
    and created_at >= v_day_start
    and created_at < v_day_end;

  v_remaining := greatest(v_cap - v_count, 0);

  return query
  insert into public.user_katakana_progress (user_id, katakana_id, session_id, status, due_at)
  select p_user_id, c.id, p_session_id, 'learning', now()
  from public.get_new_katakana_candidates(p_user_id, v_remaining) c
  join public.katakana k on k.id = c.id
  where c.entry_kind = 'example'
    and exists (
      select 1
      from public.user_katakana_rule_progress rp
      join public.katakana r on r.id = rp.katakana_id
      where rp.user_id = p_user_id and r.kana_type = k.kana_type
    )
  on conflict (user_id, katakana_id) do nothing
  returning user_katakana_progress.katakana_id;
end;
$function$;

grant execute on function public.introduce_hiragana_examples(uuid, text, bigint) to authenticated;
grant execute on function public.introduce_katakana_examples(uuid, text, bigint) to authenticated;
