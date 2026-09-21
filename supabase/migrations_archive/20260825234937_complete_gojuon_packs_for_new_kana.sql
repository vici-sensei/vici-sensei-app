-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Hiragana/katakana rows that share a gojuon_row (e.g. あ/い/う/え/お, all
-- gojuon_row = 'a') are meant to be introduced together as one pack, not cut
-- off mid-row by new_hiragana_per_day/new_katakana_per_day. Previously
-- get_new_hiragana_candidates/get_new_katakana_candidates just ordered by
-- sort_order and hard-LIMITed to the remaining daily quota, so a user whose
-- quota ran out after 3 of a 5-character row got an incomplete pack that day
-- and picked up the rest tomorrow.
--
-- Fix: get_new_*_candidates now returns whole gojuon_row packs -- it keeps
-- adding candidate rows (in sort_order/pack order) until the cumulative count
-- reaches p_limit, INCLUDING the pack that crosses the threshold, even though
-- that means returning more than p_limit rows. If the quota is already fully
-- spent (p_limit <= 0) no new pack is started.
--
-- introduce_hiragana/introduce_katakana enforced the daily cap with a hard
-- `v_count >= v_cap` check, which would have rejected exactly the overflow
-- rows the candidate list now offers. That check is relaxed to match: once at
-- or over cap, an introduction is still allowed if another character from the
-- same gojuon_row was already introduced today (i.e. this call is completing
-- a pack that straddled the cap), and only rejected if it would start a new
-- pack after the cap's been reached.

create or replace function public.get_new_hiragana_candidates(p_user_id uuid, p_limit integer)
returns table(id bigint, "character" text, romaji text, gojuon_row text)
language sql
stable
as $function$
  with candidates as (
    select h.id, h."character", h.romaji, h.gojuon_row, h.sort_order
    from public.hiragana h
    where not exists (
      select 1 from public.user_hiragana_progress p
      where p.user_id = p_user_id and p.hiragana_id = h.id
    )
    and exists (
      select 1 from public.user_study_settings s
      where s.user_id = p_user_id and s.study_track = 'kana' and s.study_hiragana
    )
  ),
  row_stats as (
    select gojuon_row, min(sort_order) as row_sort, count(*) as row_count
    from candidates
    group by gojuon_row
  ),
  row_cum as (
    select gojuon_row, row_count,
           sum(row_count) over (order by row_sort) as cum_count
    from row_stats
  ),
  selected_rows as (
    select gojuon_row
    from row_cum
    where cum_count - row_count < p_limit
  )
  select c.id, c."character", c.romaji, c.gojuon_row
  from candidates c
  join selected_rows sr on sr.gojuon_row = c.gojuon_row
  order by c.sort_order asc;
$function$;

create or replace function public.get_new_katakana_candidates(p_user_id uuid, p_limit integer)
returns table(id bigint, "character" text, romaji text, gojuon_row text)
language sql
stable
as $function$
  with candidates as (
    select k.id, k."character", k.romaji, k.gojuon_row, k.sort_order
    from public.katakana k
    where not exists (
      select 1 from public.user_katakana_progress p
      where p.user_id = p_user_id and p.katakana_id = k.id
    )
    and exists (
      select 1 from public.user_study_settings s
      where s.user_id = p_user_id and s.study_track = 'kana' and s.study_katakana
    )
  ),
  row_stats as (
    select gojuon_row, min(sort_order) as row_sort, count(*) as row_count
    from candidates
    group by gojuon_row
  ),
  row_cum as (
    select gojuon_row, row_count,
           sum(row_count) over (order by row_sort) as cum_count
    from row_stats
  ),
  selected_rows as (
    select gojuon_row
    from row_cum
    where cum_count - row_count < p_limit
  )
  select c.id, c."character", c.romaji, c.gojuon_row
  from candidates c
  join selected_rows sr on sr.gojuon_row = c.gojuon_row
  order by c.sort_order asc;
$function$;

create or replace function public.introduce_hiragana(p_user_id uuid, p_hiragana_id bigint, p_timezone text default 'UTC', p_session_id bigint default null)
returns void
language plpgsql
as $function$
declare
  v_cap integer;
  v_count integer;
  v_local_date date := (now() at time zone p_timezone)::date;
  v_day_start timestamptz := (v_local_date::text)::timestamp at time zone p_timezone;
  v_day_end timestamptz := v_day_start + interval '1 day';
begin
  perform pg_advisory_xact_lock(hashtext('introduce_hiragana:' || p_user_id::text));

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

  if v_count >= v_cap then
    -- Over the cap already -- still allow this one if it's finishing a pack
    -- (another character from the same gojuon_row) that was already started
    -- today, rather than starting a fresh pack once the cap is spent.
    if not exists (
      select 1
      from public.user_hiragana_progress p
      join public.hiragana h on h.id = p.hiragana_id
      where p.user_id = p_user_id
        and p.created_at >= v_day_start
        and p.created_at < v_day_end
        and h.gojuon_row = (select gojuon_row from public.hiragana where id = p_hiragana_id)
    ) then
      raise exception 'Daily new hiragana limit reached' using errcode = 'P0002';
    end if;
  end if;

  if exists (
    select 1 from public.user_hiragana_progress
    where user_id = p_user_id and hiragana_id = p_hiragana_id
  ) then
    raise exception 'This hiragana character has already been introduced' using errcode = 'P0002';
  end if;

  insert into public.user_hiragana_progress (user_id, hiragana_id, session_id, status, due_at)
  values (p_user_id, p_hiragana_id, p_session_id, 'learning', now() + interval '1 minute');
end;
$function$;

create or replace function public.introduce_katakana(p_user_id uuid, p_katakana_id bigint, p_timezone text default 'UTC', p_session_id bigint default null)
returns void
language plpgsql
as $function$
declare
  v_cap integer;
  v_count integer;
  v_local_date date := (now() at time zone p_timezone)::date;
  v_day_start timestamptz := (v_local_date::text)::timestamp at time zone p_timezone;
  v_day_end timestamptz := v_day_start + interval '1 day';
begin
  perform pg_advisory_xact_lock(hashtext('introduce_katakana:' || p_user_id::text));

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

  if v_count >= v_cap then
    -- Same pack-completion carve-out as introduce_hiragana above.
    if not exists (
      select 1
      from public.user_katakana_progress p
      join public.katakana k on k.id = p.katakana_id
      where p.user_id = p_user_id
        and p.created_at >= v_day_start
        and p.created_at < v_day_end
        and k.gojuon_row = (select gojuon_row from public.katakana where id = p_katakana_id)
    ) then
      raise exception 'Daily new katakana limit reached' using errcode = 'P0002';
    end if;
  end if;

  if exists (
    select 1 from public.user_katakana_progress
    where user_id = p_user_id and katakana_id = p_katakana_id
  ) then
    raise exception 'This katakana character has already been introduced' using errcode = 'P0002';
  end if;

  insert into public.user_katakana_progress (user_id, katakana_id, session_id, status, due_at)
  values (p_user_id, p_katakana_id, p_session_id, 'learning', now() + interval '1 minute');
end;
$function$;

grant execute on function public.get_new_hiragana_candidates(uuid, integer) to authenticated;
grant execute on function public.get_new_katakana_candidates(uuid, integer) to authenticated;
grant execute on function public.introduce_hiragana(uuid, bigint, text, bigint) to authenticated;
grant execute on function public.introduce_katakana(uuid, bigint, text, bigint) to authenticated;
