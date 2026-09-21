-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- get_new_hiragana_candidates/get_new_katakana_candidates always packed candidates by
-- gojuon_row -- fine for entry_kind = 'character' rows (a real gojuon row, e.g. だ/ば/ざ, is a
-- meaningful unit), but pointless for entry_kind = 'example' rows now that most gojuon_row groups
-- have exactly one drillable member left (20260906_selective_examples_and_seion_only_drill.sql).
-- Per user request, example rows now pack by kana_type instead -- all of sokuon's 3 drillable
-- rows (っき/って/っす) become one pack, all of yōon's 6 (ちゃ/しゅ/じょ/にゃ/ぴょ/きゅ) become
-- one pack, etc. -- so their reading cards later arrive and stay grouped together in the /study
-- queue (see useStudyQueue.ts's introBundleKey, extended alongside this migration), same "never
-- leave a pack half-done" guarantee character packs already have. Character rows (seion/dakuten/
-- handakuten) are untouched -- still packed by gojuon_row exactly as before.
--
-- get_new_hiragana_rule_candidates/get_new_katakana_rule_candidates' char_candidates CTE (its
-- "which characters are about to be introduced this same fetch" prediction, used by the
-- interleaving check) is updated the same way, so its prediction stays consistent with what
-- get_new_hiragana_candidates will actually return.
--
-- Return shapes are unchanged for all four functions -- CREATE OR REPLACE, no DROP needed.

create or replace function public.get_new_hiragana_candidates(p_user_id uuid, p_limit integer)
returns table(id bigint, "character" text, romaji text, gojuon_row text, sort_order integer, entry_kind text)
language sql
stable
as $function$
  with candidates as (
    select h.id, h."character", h.romaji, h.gojuon_row, h.sort_order, h.entry_kind,
           case when h.entry_kind = 'character' then h.gojuon_row else h.kana_type end as pack_key
    from public.hiragana h
    where h.entry_kind != 'rule'
    and h.drillable
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
    select pack_key, min(sort_order) as row_sort, count(*) as row_count
    from candidates
    group by pack_key
  ),
  row_cum as (
    select pack_key, row_count,
           sum(row_count) over (order by row_sort) as cum_count
    from row_stats
  ),
  selected_rows as (
    select pack_key
    from row_cum
    where cum_count - row_count < p_limit
  )
  select c.id, c."character", c.romaji, c.gojuon_row, c.sort_order, c.entry_kind
  from candidates c
  join selected_rows sr on sr.pack_key = c.pack_key
  order by c.sort_order asc;
$function$;

create or replace function public.get_new_katakana_candidates(p_user_id uuid, p_limit integer)
returns table(id bigint, "character" text, romaji text, gojuon_row text, sort_order integer, entry_kind text)
language sql
stable
as $function$
  with candidates as (
    select k.id, k."character", k.romaji, k.gojuon_row, k.sort_order, k.entry_kind,
           case when k.entry_kind = 'character' then k.gojuon_row else k.kana_type end as pack_key
    from public.katakana k
    where k.entry_kind != 'rule'
    and k.drillable
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
    select pack_key, min(sort_order) as row_sort, count(*) as row_count
    from candidates
    group by pack_key
  ),
  row_cum as (
    select pack_key, row_count,
           sum(row_count) over (order by row_sort) as cum_count
    from row_stats
  ),
  selected_rows as (
    select pack_key
    from row_cum
    where cum_count - row_count < p_limit
  )
  select c.id, c."character", c.romaji, c.gojuon_row, c.sort_order, c.entry_kind
  from candidates c
  join selected_rows sr on sr.pack_key = c.pack_key
  order by c.sort_order asc;
$function$;

create or replace function public.get_new_hiragana_rule_candidates(p_user_id uuid, p_limit integer)
returns table(
  id bigint, "character" text, notes text, kana_type text, sort_order integer,
  label text, technical_term text, examples jsonb
)
language sql
stable
as $function$
  with char_candidates as (
    select h.id, h.sort_order,
           case when h.entry_kind = 'character' then h.gojuon_row else h.kana_type end as pack_key
    from public.hiragana h
    where h.entry_kind != 'rule'
    and h.drillable
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
        and h.drillable
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
    select k.id, k.sort_order,
           case when k.entry_kind = 'character' then k.gojuon_row else k.kana_type end as pack_key
    from public.katakana k
    where k.entry_kind != 'rule'
    and k.drillable
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
        and k.drillable
        and k.sort_order < r.sort_order
        and not exists (select 1 from public.user_katakana_progress p where p.user_id = p_user_id and p.katakana_id = k.id)
        and not exists (select 1 from about_to_introduce a where a.id = k.id)
    )
  order by r.sort_order asc;
$function$;
