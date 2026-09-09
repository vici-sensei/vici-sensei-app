-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Every place that groups hiragana/katakana rows into an intro "pack" (get_new_hiragana_candidates/
-- get_new_katakana_candidates, get_new_hiragana_rule_candidates/get_new_katakana_rule_candidates,
-- introduce_hiragana/introduce_katakana) computed the group key inline as
-- `case when entry_kind = 'character' then gojuon_row else kana_type end`. That worked, but it
-- meant a pack's membership was implicit and only editable by changing gojuon_row/kana_type --
-- columns that also drive Browse's display grouping and section labels (see lib/srs/gojuon.ts,
-- BrowseKanaListPage.tsx). There was no way to, say, merge わ/を's pack with ん's pack without
-- also moving ん into Browse's "WA" section.
--
-- Fix: materialize that computed key into a real `pack_id` integer column on hiragana/katakana.
-- Backfilled below to reproduce the exact current grouping (one pack_id per distinct gojuon_row
-- among entry_kind = 'character' rows, one per distinct kana_type among rule/example rows), then
-- every pack-forming query switches from the inline case-when to reading pack_id directly.
-- gojuon_row/kana_type themselves are untouched -- Browse's grouping and labels don't move.
--
-- Once this lands, merging two packs (e.g. わ/を with ん) is a plain data edit:
--   update public.hiragana set pack_id = (select pack_id from public.hiragana where character = 'わ')
--   where character = 'ん';
--   update public.katakana set pack_id = (select pack_id from public.katakana where character = 'ワ')
--   where character = 'ン';
-- No further migration needed for that -- every function below reads pack_id at query time.

-- ---------------------------------------------------------------------------
-- 1. pack_id column + backfill, preserving today's grouping exactly.
-- ---------------------------------------------------------------------------
alter table public.hiragana add column if not exists pack_id integer;
alter table public.katakana add column if not exists pack_id integer;

with pack_keys as (
  select id, sort_order,
         case when entry_kind = 'character' then gojuon_row else kana_type end as pack_key
  from public.hiragana
),
pack_order as (
  select pack_key, min(sort_order) as row_sort
  from pack_keys
  group by pack_key
),
pack_numbers as (
  select pack_key, dense_rank() over (order by row_sort) as pack_id
  from pack_order
)
update public.hiragana h
set pack_id = pn.pack_id
from pack_keys pk
join pack_numbers pn on pn.pack_key = pk.pack_key
where pk.id = h.id;

with pack_keys as (
  select id, sort_order,
         case when entry_kind = 'character' then gojuon_row else kana_type end as pack_key
  from public.katakana
),
pack_order as (
  select pack_key, min(sort_order) as row_sort
  from pack_keys
  group by pack_key
),
pack_numbers as (
  select pack_key, dense_rank() over (order by row_sort) as pack_id
  from pack_order
)
update public.katakana k
set pack_id = pn.pack_id
from pack_keys pk
join pack_numbers pn on pn.pack_key = pk.pack_key
where pk.id = k.id;

alter table public.hiragana alter column pack_id set not null;
alter table public.katakana alter column pack_id set not null;

-- ---------------------------------------------------------------------------
-- 2. get_new_hiragana_candidates/get_new_katakana_candidates: group by pack_id instead of the
--    inline case-when, and expose pack_id on the return row so useStudyQueue.ts's
--    newKanaPackKey can key off it directly instead of gojuon_row (see client-side change).
--    Return shape gains a column, so these have to be dropped and recreated.
-- ---------------------------------------------------------------------------
drop function if exists public.get_new_hiragana_candidates(uuid, integer);

create function public.get_new_hiragana_candidates(p_user_id uuid, p_limit integer)
returns table(id bigint, "character" text, romaji text, gojuon_row text, sort_order integer, entry_kind text, pack_id integer)
language sql
stable
as $function$
  with candidates as (
    select h.id, h."character", h.romaji, h.gojuon_row, h.sort_order, h.entry_kind, h.pack_id
    from public.hiragana h
    where h.entry_kind != 'rule'
    and h.study_enabled
    and not exists (
      select 1 from public.user_hiragana_progress p
      where p.user_id = p_user_id and p.hiragana_id = h.id
    )
    and exists (
      select 1 from public.user_study_settings s
      where s.user_id = p_user_id and s.study_track = 'kana' and s.study_hiragana
    )
  ),
  row_stats as (
    select pack_id, min(sort_order) as row_sort, count(*) as row_count,
           bool_or(entry_kind = 'example') as is_example_pack
    from candidates
    group by pack_id
  ),
  row_cum as (
    select pack_id, row_count, row_sort, is_example_pack,
           sum(row_count) over (order by row_sort) as cum_count
    from row_stats
  ),
  selected_rows as (
    select rc.pack_id
    from row_cum rc
    where rc.cum_count - rc.row_count < p_limit
      and (
        not rc.is_example_pack
        or not exists (
          select 1 from candidates c2
          where c2.entry_kind = 'character' and c2.sort_order < rc.row_sort
        )
      )
  )
  select c.id, c."character", c.romaji, c.gojuon_row, c.sort_order, c.entry_kind, c.pack_id
  from candidates c
  join selected_rows sr on sr.pack_id = c.pack_id
  order by c.sort_order asc;
$function$;

grant execute on function public.get_new_hiragana_candidates(uuid, integer) to authenticated;

drop function if exists public.get_new_katakana_candidates(uuid, integer);

create function public.get_new_katakana_candidates(p_user_id uuid, p_limit integer)
returns table(id bigint, "character" text, romaji text, gojuon_row text, sort_order integer, entry_kind text, pack_id integer)
language sql
stable
as $function$
  with candidates as (
    select k.id, k."character", k.romaji, k.gojuon_row, k.sort_order, k.entry_kind, k.pack_id
    from public.katakana k
    where k.entry_kind != 'rule'
    and k.study_enabled
    and not exists (
      select 1 from public.user_katakana_progress p
      where p.user_id = p_user_id and p.katakana_id = k.id
    )
    and exists (
      select 1 from public.user_study_settings s
      where s.user_id = p_user_id and s.study_track = 'kana' and s.study_katakana
    )
  ),
  row_stats as (
    select pack_id, min(sort_order) as row_sort, count(*) as row_count,
           bool_or(entry_kind = 'example') as is_example_pack
    from candidates
    group by pack_id
  ),
  row_cum as (
    select pack_id, row_count, row_sort, is_example_pack,
           sum(row_count) over (order by row_sort) as cum_count
    from row_stats
  ),
  selected_rows as (
    select rc.pack_id
    from row_cum rc
    where rc.cum_count - rc.row_count < p_limit
      and (
        not rc.is_example_pack
        or not exists (
          select 1 from candidates c2
          where c2.entry_kind = 'character' and c2.sort_order < rc.row_sort
        )
      )
  )
  select c.id, c."character", c.romaji, c.gojuon_row, c.sort_order, c.entry_kind, c.pack_id
  from candidates c
  join selected_rows sr on sr.pack_id = c.pack_id
  order by c.sort_order asc;
$function$;

grant execute on function public.get_new_katakana_candidates(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. get_new_hiragana_rule_candidates/get_new_katakana_rule_candidates: same swap, but their
--    return shape is unchanged (pack_id was only ever an internal grouping key here, never
--    returned), so a plain create-or-replace is enough -- no drop needed.
-- ---------------------------------------------------------------------------
create or replace function public.get_new_hiragana_rule_candidates(p_user_id uuid, p_limit integer)
returns table(
  id bigint, "character" text, notes text, kana_type text, sort_order integer,
  label text, technical_term text, examples jsonb
)
language sql
stable
as $function$
  with char_candidates as (
    select h.id, h.sort_order, h.kana_type, h.pack_id as pack_key
    from public.hiragana h
    where h.entry_kind != 'rule'
    and h.study_enabled
    and not exists (
      select 1 from public.user_hiragana_progress p
      where p.user_id = p_user_id and p.hiragana_id = h.id
    )
  ),
  row_stats as (
    select pack_key, min(sort_order) as row_sort, count(*) as row_count
    from char_candidates
    group by pack_key
  ),
  row_cum as (
    select pack_key, row_count, sum(row_count) over (order by row_sort) as cum_count
    from row_stats
  ),
  about_to_introduce as (
    select c.id
    from char_candidates c
    join row_cum rc on rc.pack_key = c.pack_key
    where rc.cum_count - rc.row_count < p_limit
  )
  select
    r.id, r."character", r.notes, r.kana_type, r.sort_order,
    krl.label, krl.technical_term,
    (
      select coalesce(
        jsonb_agg(jsonb_build_object('character', e."character", 'romaji', e.romaji, 'gojuon_row', e.gojuon_row) order by e.sort_order),
        '[]'::jsonb
      )
      from public.hiragana e
      where e.kana_type = r.kana_type and e.entry_kind = 'example'
    ) as examples
  from public.hiragana r
  left join public.kana_rule_labels krl on krl.kana_type = r.kana_type
  where r.entry_kind = 'rule'
    and not exists (
      select 1 from public.user_hiragana_rule_progress up
      where up.user_id = p_user_id and up.hiragana_id = r.id
    )
    and exists (
      select 1 from public.user_study_settings s
      where s.user_id = p_user_id and s.study_track = 'kana' and s.study_hiragana
    )
    and not exists (
      select 1 from public.hiragana h
      where h.entry_kind != 'rule'
        and h.study_enabled
        and h.sort_order < r.sort_order
        and not exists (select 1 from public.user_hiragana_progress p where p.user_id = p_user_id and p.hiragana_id = h.id)
        and not exists (select 1 from about_to_introduce a where a.id = h.id)
    )
    and not exists (
      select 1
      from char_candidates cc
      where cc.kana_type = r.kana_type
        and cc.sort_order = (
          select min(cc2.sort_order) from char_candidates cc2 where cc2.kana_type = r.kana_type
        )
        and not exists (select 1 from about_to_introduce a where a.id = cc.id)
    )
  order by r.sort_order asc;
$function$;

create or replace function public.get_new_katakana_rule_candidates(p_user_id uuid, p_limit integer)
returns table(
  id bigint, "character" text, notes text, kana_type text, sort_order integer,
  label text, technical_term text, examples jsonb
)
language sql
stable
as $function$
  with char_candidates as (
    select k.id, k.sort_order, k.kana_type, k.pack_id as pack_key
    from public.katakana k
    where k.entry_kind != 'rule'
    and k.study_enabled
    and not exists (
      select 1 from public.user_katakana_progress p
      where p.user_id = p_user_id and p.katakana_id = k.id
    )
  ),
  row_stats as (
    select pack_key, min(sort_order) as row_sort, count(*) as row_count
    from char_candidates
    group by pack_key
  ),
  row_cum as (
    select pack_key, row_count, sum(row_count) over (order by row_sort) as cum_count
    from row_stats
  ),
  about_to_introduce as (
    select c.id
    from char_candidates c
    join row_cum rc on rc.pack_key = c.pack_key
    where rc.cum_count - rc.row_count < p_limit
  )
  select
    r.id, r."character", r.notes, r.kana_type, r.sort_order,
    krl.label, krl.technical_term,
    (
      select coalesce(
        jsonb_agg(jsonb_build_object('character', e."character", 'romaji', e.romaji, 'gojuon_row', e.gojuon_row) order by e.sort_order),
        '[]'::jsonb
      )
      from public.katakana e
      where e.kana_type = r.kana_type and e.entry_kind = 'example'
    ) as examples
  from public.katakana r
  left join public.kana_rule_labels krl on krl.kana_type = r.kana_type
  where r.entry_kind = 'rule'
    and not exists (
      select 1 from public.user_katakana_rule_progress up
      where up.user_id = p_user_id and up.katakana_id = r.id
    )
    and exists (
      select 1 from public.user_study_settings s
      where s.user_id = p_user_id and s.study_track = 'kana' and s.study_katakana
    )
    and not exists (
      select 1 from public.katakana k
      where k.entry_kind != 'rule'
        and k.study_enabled
        and k.sort_order < r.sort_order
        and not exists (select 1 from public.user_katakana_progress p where p.user_id = p_user_id and p.katakana_id = k.id)
        and not exists (select 1 from about_to_introduce a where a.id = k.id)
    )
    and not exists (
      select 1
      from char_candidates cc
      where cc.kana_type = r.kana_type
        and cc.sort_order = (
          select min(cc2.sort_order) from char_candidates cc2 where cc2.kana_type = r.kana_type
        )
        and not exists (select 1 from about_to_introduce a where a.id = cc.id)
    )
  order by r.sort_order asc;
$function$;

-- ---------------------------------------------------------------------------
-- 4. introduce_hiragana/introduce_katakana: the daily-cap overflow carve-out and the pack-
--    completion check/release both keyed off gojuon_row -- switch both to pack_id. Return shape
--    unchanged, so create-or-replace is enough.
-- ---------------------------------------------------------------------------
create or replace function public.introduce_hiragana(p_user_id uuid, p_hiragana_id bigint, p_timezone text default 'UTC'::text, p_session_id bigint default null::bigint)
returns table(pack_completed boolean, hiragana_ids bigint[])
language plpgsql
as $function$
declare
  v_cap integer;
  v_count integer;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_pack_id integer;
  v_pack_total integer;
  v_pack_done integer;
  v_completed boolean := false;
  v_ids bigint[] := null;
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

  select pack_id into v_pack_id from public.hiragana where id = p_hiragana_id;

  select count(*) into v_count
  from public.user_hiragana_progress
  where user_id = p_user_id
    and created_at >= v_day_start
    and created_at < v_day_end;

  if v_count >= v_cap then
    -- Over the cap already -- still allow this one if it's finishing a pack (another
    -- character sharing this pack_id) that was already started today, rather than starting a
    -- fresh pack once the cap is spent.
    if not exists (
      select 1
      from public.user_hiragana_progress p
      join public.hiragana h on h.id = p.hiragana_id
      where p.user_id = p_user_id
        and p.created_at >= v_day_start
        and p.created_at < v_day_end
        and h.pack_id = v_pack_id
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

  insert into public.user_hiragana_progress (user_id, hiragana_id, session_id, status, due_at, pack_pending)
  values (p_user_id, p_hiragana_id, p_session_id, 'learning', now(), true);

  select count(*) into v_pack_total
  from public.hiragana
  where pack_id = v_pack_id and entry_kind = 'character' and study_enabled;

  select count(*) into v_pack_done
  from public.user_hiragana_progress p
  join public.hiragana h on h.id = p.hiragana_id
  where p.user_id = p_user_id
    and h.pack_id = v_pack_id
    and h.entry_kind = 'character'
    and h.study_enabled;

  if v_pack_done >= v_pack_total then
    update public.user_hiragana_progress p
    set pack_pending = false, due_at = now()
    from public.hiragana h
    where p.hiragana_id = h.id
      and p.user_id = p_user_id
      and h.pack_id = v_pack_id
      and h.entry_kind = 'character'
      and h.study_enabled;

    select array_agg(h.id order by h.sort_order) into v_ids
    from public.hiragana h
    where h.pack_id = v_pack_id and h.entry_kind = 'character' and h.study_enabled;

    v_completed := true;
  end if;

  return query select v_completed, v_ids;
end;
$function$;

create or replace function public.introduce_katakana(p_user_id uuid, p_katakana_id bigint, p_timezone text default 'UTC'::text, p_session_id bigint default null::bigint)
returns table(pack_completed boolean, katakana_ids bigint[])
language plpgsql
as $function$
declare
  v_cap integer;
  v_count integer;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_pack_id integer;
  v_pack_total integer;
  v_pack_done integer;
  v_completed boolean := false;
  v_ids bigint[] := null;
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

  select pack_id into v_pack_id from public.katakana where id = p_katakana_id;

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
        and k.pack_id = v_pack_id
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

  insert into public.user_katakana_progress (user_id, katakana_id, session_id, status, due_at, pack_pending)
  values (p_user_id, p_katakana_id, p_session_id, 'learning', now(), true);

  select count(*) into v_pack_total
  from public.katakana
  where pack_id = v_pack_id and entry_kind = 'character' and study_enabled;

  select count(*) into v_pack_done
  from public.user_katakana_progress p
  join public.katakana k on k.id = p.katakana_id
  where p.user_id = p_user_id
    and k.pack_id = v_pack_id
    and k.entry_kind = 'character'
    and k.study_enabled;

  if v_pack_done >= v_pack_total then
    update public.user_katakana_progress p
    set pack_pending = false, due_at = now()
    from public.katakana k
    where p.katakana_id = k.id
      and p.user_id = p_user_id
      and k.pack_id = v_pack_id
      and k.entry_kind = 'character'
      and k.study_enabled;

    select array_agg(k.id order by k.sort_order) into v_ids
    from public.katakana k
    where k.pack_id = v_pack_id and k.entry_kind = 'character' and k.study_enabled;

    v_completed := true;
  end if;

  return query select v_completed, v_ids;
end;
$function$;
