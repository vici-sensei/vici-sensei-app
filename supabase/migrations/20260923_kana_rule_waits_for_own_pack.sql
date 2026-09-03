-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- get_new_hiragana_rule_candidates/get_new_katakana_rule_candidates (20260904_kana_rule_cards.sql)
-- only ever checked that nothing PRECEDING a rule (by sort_order) was still un-introduced --
-- correct as far as it went, but it never checked anything about the rule's OWN pack (the
-- characters/examples immediately after it that it explains). That leaves a real gap: if a day's
-- remaining new_hiragana_per_day/new_katakana_per_day budget runs out at exactly the moment the
-- preceding kana_type finishes, the rule still passes its "nothing un-introduced precedes me"
-- check (there's nothing left to check -- the preceding material is done) even though its own pack
-- has zero budget left to be offered this same fetch. The rule shows alone; its pack doesn't show
-- until the cap resets, a day (or more) later, by which point the rule is already marked seen and
-- never appears again to accompany it. Verified against live data with a dry-run comparison (fresh
-- user, hiragana table): at p_limit=0 the old check let the very first (seion) rule through with
-- zero characters offered; at p_limit=46 (all 46 seion characters exactly fit, but dakuten's first
-- pack -- が/ぎ/ぐ/げ/ご -- needs 47+) the old check let the dakuten rule through a day ahead of が.
--
-- Fix: add one more condition -- the rule's own kana_type's EARLIEST not-yet-introduced pack_key
-- group (the same pack_key grouping get_new_hiragana_candidates already uses: gojuon_row for
-- entry_kind='character', kana_type itself for entry_kind='example') must also be part of this
-- same fetch's about_to_introduce set. Deliberately scoped to only the nearest pack_key, not every
-- pack_key sharing the rule's kana_type: a kana_type like dakuten spans four separate gojuon_row
-- packs (ga/za/da/ba, 5 characters each) introduced one pack at a time across however many days the
-- daily cap takes -- by design, same as every other multi-pack kana_type. Requiring all four to
-- land in one fetch would just trade "rule shows alone" for "rule almost never shows", since a
-- 15/day cap rarely clears 20 characters in a single fetch. Requiring only the nearest pack means
-- the rule shows together with whichever slice of its pack is about to be introduced right now,
-- and simply waits (still unseen) for the day that slice actually has room -- exactly the
-- behavior already guaranteed for the character-vs-character case by get_new_hiragana_candidates's
-- own atomic pack_key selection.
--
-- A rule whose entire pack is non-study_enabled (reference-only, e.g. if every example under a
-- kana_type were curated out of the study pipeline) is unaffected: char_candidates already excludes
-- non-study_enabled rows entirely, so the "earliest pack_key" subquery for that kana_type finds no
-- rows and the new condition is vacuously satisfied, same as the existing "preceding material"
-- check already handles this case.
--
-- Bodies are otherwise byte-for-byte the same as the live definitions (confirmed via
-- pg_get_functiondef against the linked project before writing this).

create or replace function public.get_new_hiragana_rule_candidates(p_user_id uuid, p_limit integer)
returns table(
  id bigint, "character" text, notes text, kana_type text, sort_order integer,
  label text, technical_term text, examples jsonb
)
language sql
stable
as $function$
  with char_candidates as (
    select h.id, h.sort_order, h.kana_type,
           case when h.entry_kind = 'character' then h.gojuon_row else h.kana_type end as pack_key
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
    select k.id, k.sort_order, k.kana_type,
           case when k.entry_kind = 'character' then k.gojuon_row else k.kana_type end as pack_key
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

grant execute on function public.get_new_hiragana_rule_candidates(uuid, integer) to authenticated;
grant execute on function public.get_new_katakana_rule_candidates(uuid, integer) to authenticated;
