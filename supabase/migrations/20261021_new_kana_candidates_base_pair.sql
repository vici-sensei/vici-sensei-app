-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- The "New hiragana"/"New katakana" intro card (NewKanaIntroCard.tsx) currently just shows a
-- dakuten/handakuten candidate's own character + romaji (e.g. "が" / "ga"), with no indication
-- that it's が = か + ゛. Per user request: pair it with its seion base so the card reads
-- "か ka → が ga" instead.
--
-- get_new_hiragana_candidates/get_new_katakana_candidates don't currently return kana_type at
-- all, and there's no column linking a dakuten/handakuten row back to its seion counterpart --
-- so both gain kana_type plus base_character/base_romaji (null for seion candidates, which is
-- everything but dakuten/handakuten -- character candidates never include yoon/sokuon/...). The
-- base pair is derived, not stored: dakuten/handakuten rows share their family's seion row
-- (ga/za/da/ba/pa -> ka/sa/ta/ha/ha) and line up with it position-for-position (verified against
-- the live hiragana/katakana tables -- か/き/く/け/こ vs が/ぎ/ぐ/げ/ご, etc.), so a lateral join
-- keyed on that position is enough; no new column/backfill needed. Return shape gains columns, so
-- these have to be dropped and recreated (same as 20261019_kana_pack_id_column.sql).
drop function if exists public.get_new_hiragana_candidates(uuid, integer);

create function public.get_new_hiragana_candidates(p_user_id uuid, p_limit integer)
returns table(
  id bigint, "character" text, romaji text, gojuon_row text, sort_order integer, entry_kind text,
  pack_id integer, kana_type text, base_character text, base_romaji text
)
language sql
stable
as $function$
  with candidates as (
    select h.id, h."character", h.romaji, h.gojuon_row, h.sort_order, h.entry_kind, h.pack_id, h.kana_type
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
  ),
  -- dakuten/handakuten gojuon_row -> the seion row it's derived from (see comment above).
  base_rows(row_key, base_row) as (
    values ('ga', 'ka'), ('za', 'sa'), ('da', 'ta'), ('ba', 'ha'), ('pa', 'ha')
  )
  select
    c.id, c."character", c.romaji, c.gojuon_row, c.sort_order, c.entry_kind, c.pack_id, c.kana_type,
    base."character" as base_character, base.romaji as base_romaji
  from candidates c
  join selected_rows sr on sr.pack_id = c.pack_id
  left join base_rows br on br.row_key = c.gojuon_row and c.kana_type in ('dakuten', 'handakuten')
  left join lateral (
    select b."character", b.romaji
    from public.hiragana b
    where b.gojuon_row = br.base_row and b.kana_type = 'seion'
    order by b.sort_order
    -- same 0-based position within its own row that c holds within its own row.
    offset (
      select count(*) from public.hiragana h2
      where h2.gojuon_row = c.gojuon_row and h2.kana_type = c.kana_type and h2.sort_order < c.sort_order
    )
    limit 1
  ) base on true
  order by c.sort_order asc;
$function$;

grant execute on function public.get_new_hiragana_candidates(uuid, integer) to authenticated;

drop function if exists public.get_new_katakana_candidates(uuid, integer);

create function public.get_new_katakana_candidates(p_user_id uuid, p_limit integer)
returns table(
  id bigint, "character" text, romaji text, gojuon_row text, sort_order integer, entry_kind text,
  pack_id integer, kana_type text, base_character text, base_romaji text
)
language sql
stable
as $function$
  with candidates as (
    select k.id, k."character", k.romaji, k.gojuon_row, k.sort_order, k.entry_kind, k.pack_id, k.kana_type
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
  ),
  base_rows(row_key, base_row) as (
    values ('ga', 'ka'), ('za', 'sa'), ('da', 'ta'), ('ba', 'ha'), ('pa', 'ha')
  )
  select
    c.id, c."character", c.romaji, c.gojuon_row, c.sort_order, c.entry_kind, c.pack_id, c.kana_type,
    base."character" as base_character, base.romaji as base_romaji
  from candidates c
  join selected_rows sr on sr.pack_id = c.pack_id
  left join base_rows br on br.row_key = c.gojuon_row and c.kana_type in ('dakuten', 'handakuten')
  left join lateral (
    select b."character", b.romaji
    from public.katakana b
    where b.gojuon_row = br.base_row and b.kana_type = 'seion'
    order by b.sort_order
    offset (
      select count(*) from public.katakana k2
      where k2.gojuon_row = c.gojuon_row and k2.kana_type = c.kana_type and k2.sort_order < c.sort_order
    )
    limit 1
  ) base on true
  order by c.sort_order asc;
$function$;

grant execute on function public.get_new_katakana_candidates(uuid, integer) to authenticated;
