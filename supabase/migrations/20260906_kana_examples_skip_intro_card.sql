-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- entry_kind = 'example' rows (sokuon/yōon/n_gemination/chōonpu's っか/きゃ/んな/アー-style
-- illustrative rows, and extended katakana's ファ/ヴァ family) no longer get their own "New
-- Hiragana"/"New Katakana" intro card -- their content is already shown, all at once, in the
-- new_rule card's example grid (get_new_hiragana_rule_candidates/get_new_katakana_rule_candidates,
-- 20260904_kana_rule_cards.sql onward) right before this same pack would have introduced them, so
-- a second one-by-one "New Hiragana: っか [Next]" flash card teaches nothing new. Per user
-- request, they now skip straight to being drillable hiragana_reading/katakana_reading cards.
--
-- Per the chosen approach: entry_kind = 'example' rows still flow through
-- get_new_hiragana_candidates/get_new_katakana_candidates and are still bound by the same
-- gojuon_row-pack-vs-new_hiragana_per_day/new_katakana_per_day cap logic as before (unchanged) --
-- only entry_kind = 'character' rows are returned as new_*_to_introduce (rendered as intro cards)
-- from here on. fetchStudyQueue (lib/data/studyQueue.ts) batch-introduces every entry_kind =
-- 'example' candidate in one round trip via the new introduce_hiragana_examples/
-- introduce_katakana_examples RPCs below, then folds their fresh reading cards straight into
-- due_cards -- so they simply appear as ordinary review cards from the very first render, with no
-- visible intro step and no per-item round trip (worth avoiding: chōonpu's pack alone is 44 rows).
--
-- get_new_hiragana_candidates/get_new_katakana_candidates gain an `entry_kind` column so the
-- client can split character vs example candidates -- that's a return-shape change, so both are
-- dropped and recreated (CREATE OR REPLACE can't change a function's row type).

drop function if exists public.get_new_hiragana_candidates(uuid, integer);

create function public.get_new_hiragana_candidates(p_user_id uuid, p_limit integer)
returns table(id bigint, "character" text, romaji text, gojuon_row text, sort_order integer, entry_kind text)
language sql
stable
as $function$
  with candidates as (
    select h.id, h."character", h.romaji, h.gojuon_row, h.sort_order, h.entry_kind
    from public.hiragana h
    where h.entry_kind != 'rule'
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
  select c.id, c."character", c.romaji, c.gojuon_row, c.sort_order, c.entry_kind
  from candidates c
  join selected_rows sr on sr.gojuon_row = c.gojuon_row
  order by c.sort_order asc;
$function$;

drop function if exists public.get_new_katakana_candidates(uuid, integer);

create function public.get_new_katakana_candidates(p_user_id uuid, p_limit integer)
returns table(id bigint, "character" text, romaji text, gojuon_row text, sort_order integer, entry_kind text)
language sql
stable
as $function$
  with candidates as (
    select k.id, k."character", k.romaji, k.gojuon_row, k.sort_order, k.entry_kind
    from public.katakana k
    where k.entry_kind != 'rule'
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
  select c.id, c."character", c.romaji, c.gojuon_row, c.sort_order, c.entry_kind
  from candidates c
  join selected_rows sr on sr.gojuon_row = c.gojuon_row
  order by c.sort_order asc;
$function$;

-- Batch-introduces every given hiragana/katakana id as status = 'learning', due now -- same
-- effect as calling introduce_hiragana/introduce_katakana once per id, just in one round trip.
-- No cap re-check here: the caller (fetchStudyQueue) only ever passes ids that
-- get_new_hiragana_candidates/get_new_katakana_candidates already selected within the cap, in the
-- very same fetch. `on conflict do nothing` is the only safety net needed (a duplicate call, e.g.
-- from two tabs polling at once, just no-ops for whichever id already got a row).
create or replace function public.introduce_hiragana_examples(p_user_id uuid, p_hiragana_ids bigint[], p_session_id bigint default null)
returns void
language plpgsql
as $function$
begin
  if not exists (
    select 1 from public.user_study_settings s
    where s.user_id = p_user_id and s.study_track = 'kana' and s.study_hiragana
  ) then
    raise exception 'Hiragana study is not enabled for this user' using errcode = 'P0002';
  end if;

  insert into public.user_hiragana_progress (user_id, hiragana_id, session_id, status, due_at)
  select p_user_id, id, p_session_id, 'learning', now()
  from unnest(p_hiragana_ids) as id
  on conflict (user_id, hiragana_id) do nothing;
end;
$function$;

create or replace function public.introduce_katakana_examples(p_user_id uuid, p_katakana_ids bigint[], p_session_id bigint default null)
returns void
language plpgsql
as $function$
begin
  if not exists (
    select 1 from public.user_study_settings s
    where s.user_id = p_user_id and s.study_track = 'kana' and s.study_katakana
  ) then
    raise exception 'Katakana study is not enabled for this user' using errcode = 'P0002';
  end if;

  insert into public.user_katakana_progress (user_id, katakana_id, session_id, status, due_at)
  select p_user_id, id, p_session_id, 'learning', now()
  from unnest(p_katakana_ids) as id
  on conflict (user_id, katakana_id) do nothing;
end;
$function$;

grant execute on function public.get_new_hiragana_candidates(uuid, integer) to authenticated;
grant execute on function public.get_new_katakana_candidates(uuid, integer) to authenticated;
grant execute on function public.introduce_hiragana_examples(uuid, bigint[], bigint) to authenticated;
grant execute on function public.introduce_katakana_examples(uuid, bigint[], bigint) to authenticated;
