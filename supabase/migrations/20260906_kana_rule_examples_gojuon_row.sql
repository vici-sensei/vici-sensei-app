-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- get_new_hiragana_rule_candidates/get_new_katakana_rule_candidates' `examples` jsonb only ever
-- carried {character, romaji} per entry -- enough for the flat grid NewKanaRuleIntroCard.tsx
-- rendered so far, but not enough to split it into the same per-family sub-groups Browse's
-- RuleSubsection now shows (20260906_choonpu_gojuon_row_tags.sql and the RuleSubsection grouping
-- change before it). Per user request, `examples` now also carries each row's `gojuon_row`, so the
-- study card can group with the exact same lib/srs/gojuon.ts helpers (groupByGojuonRow/
-- resolveRuleExampleRowLabel) Browse already uses. Return signature is unchanged (still
-- `examples jsonb`), so no DROP FUNCTION is needed -- just a body replacement.

create or replace function public.get_new_hiragana_rule_candidates(p_user_id uuid, p_limit integer)
returns table(
  id bigint, "character" text, notes text, kana_type text, sort_order integer,
  label text, technical_term text, examples jsonb
)
language sql
stable
as $function$
  with char_candidates as (
    select h.id, h.gojuon_row, h.sort_order
    from public.hiragana h
    where h.entry_kind != 'rule'
    and not exists (
      select 1 from public.user_hiragana_progress p
      where p.user_id = p_user_id and p.hiragana_id = h.id
    )
  ),
  row_stats as (
    select gojuon_row, min(sort_order) as row_sort, count(*) as row_count
    from char_candidates
    group by gojuon_row
  ),
  row_cum as (
    select gojuon_row, row_count, sum(row_count) over (order by row_sort) as cum_count
    from row_stats
  ),
  about_to_introduce as (
    select c.id
    from char_candidates c
    join row_cum rc on rc.gojuon_row = c.gojuon_row
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
        and h.sort_order < r.sort_order
        and not exists (select 1 from public.user_hiragana_progress p where p.user_id = p_user_id and p.hiragana_id = h.id)
        and not exists (select 1 from about_to_introduce a where a.id = h.id)
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
    select k.id, k.gojuon_row, k.sort_order
    from public.katakana k
    where k.entry_kind != 'rule'
    and not exists (
      select 1 from public.user_katakana_progress p
      where p.user_id = p_user_id and p.katakana_id = k.id
    )
  ),
  row_stats as (
    select gojuon_row, min(sort_order) as row_sort, count(*) as row_count
    from char_candidates
    group by gojuon_row
  ),
  row_cum as (
    select gojuon_row, row_count, sum(row_count) over (order by row_sort) as cum_count
    from row_stats
  ),
  about_to_introduce as (
    select c.id
    from char_candidates c
    join row_cum rc on rc.gojuon_row = c.gojuon_row
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
        and k.sort_order < r.sort_order
        and not exists (select 1 from public.user_katakana_progress p where p.user_id = p_user_id and p.katakana_id = k.id)
        and not exists (select 1 from about_to_introduce a where a.id = k.id)
    )
  order by r.sort_order asc;
$function$;
