-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Follow-up to 20261024_atomic_rule_example_handoff.sql: fixing get_new_hiragana_rule_candidates/
-- get_new_katakana_rule_candidates to stop offering a later kana_type's rule (e.g. sokuon_rule)
-- before the earlier one's (yoon) example pack has actually landed was correct for deciding what
-- to SHOW right now, but it also starved computePredictedTotal's forecast: the /study progress
-- bar's denominator (predicted_total) only ever counted the ONE currently-eligible rule
-- (hiraganaRuleCandidateCount = get_new_hiragana_rule_candidates(...).length, flat +1, no
-- follow-up cards -- see the doc comment in lib/study/totalCardsToday.ts, itself now stale: rule
-- candidates DO produce follow-up cards as of 20261024). So a student opening /study with
-- yoon_rule + sokuon_rule + n_gemination_rule all queued up for today (13 cards total: 7 for
-- yoon, 4 for sokuon, 2 for n_gemination) would see the bar start at "0 / 1" or "0 / 7" instead of
-- "0 / 13", only ratcheting up piecemeal as each rule's own pack was discovered on a later fetch.
--
-- Fix: two new read-only forecast functions that answer "how many rule + example cards will this
-- session need to get through today's hiragana/katakana, including kana_types not eligible to
-- show YET" -- deliberately separate from get_new_hiragana_rule_candidates/
-- get_new_katakana_rule_candidates, which must stay strict (only the truly-next kana_type) for
-- deciding what to show. This one intentionally walks every not-yet-introduced entry_kind='example'
-- kana_type in sort_order, cumulatively, exactly like the old (pre-20261024) about_to_introduce
-- budget lookahead -- correct for a FORECAST ("would fit in today's budget if reached"), just wrong
-- for a GATE ("is actually ready to show"), which is precisely why 20261024 split the two apart
-- instead of just tightening the one query both jobs used to share.

create or replace function public.get_hiragana_rule_forecast(p_user_id uuid, p_limit integer)
returns table(rule_count integer, example_count integer)
language sql
stable
as $function$
  with example_candidates as (
    select h.id, h.sort_order, h.kana_type
    from public.hiragana h
    where h.entry_kind = 'example'
      and h.study_enabled
      and not exists (
        select 1 from public.user_hiragana_progress p
        where p.user_id = p_user_id and p.hiragana_id = h.id
      )
  ),
  row_stats as (
    select kana_type, min(sort_order) as row_sort, count(*) as row_count
    from example_candidates
    group by kana_type
  ),
  row_cum as (
    select kana_type, row_count, sum(row_count) over (order by row_sort) as cum_count
    from row_stats
  ),
  forecast_kana_types as (
    select kana_type, row_count
    from row_cum
    where cum_count - row_count < p_limit
  )
  select
    (
      select count(*)::integer
      from public.hiragana r
      where r.entry_kind = 'rule'
        and r.kana_type in (select kana_type from forecast_kana_types)
        and not exists (
          select 1 from public.user_hiragana_rule_progress up
          where up.user_id = p_user_id and up.hiragana_id = r.id
        )
    ) as rule_count,
    (select coalesce(sum(row_count), 0)::integer from forecast_kana_types) as example_count;
$function$;

create or replace function public.get_katakana_rule_forecast(p_user_id uuid, p_limit integer)
returns table(rule_count integer, example_count integer)
language sql
stable
as $function$
  with example_candidates as (
    select k.id, k.sort_order, k.kana_type
    from public.katakana k
    where k.entry_kind = 'example'
      and k.study_enabled
      and not exists (
        select 1 from public.user_katakana_progress p
        where p.user_id = p_user_id and p.katakana_id = k.id
      )
  ),
  row_stats as (
    select kana_type, min(sort_order) as row_sort, count(*) as row_count
    from example_candidates
    group by kana_type
  ),
  row_cum as (
    select kana_type, row_count, sum(row_count) over (order by row_sort) as cum_count
    from row_stats
  ),
  forecast_kana_types as (
    select kana_type, row_count
    from row_cum
    where cum_count - row_count < p_limit
  )
  select
    (
      select count(*)::integer
      from public.katakana r
      where r.entry_kind = 'rule'
        and r.kana_type in (select kana_type from forecast_kana_types)
        and not exists (
          select 1 from public.user_katakana_rule_progress up
          where up.user_id = p_user_id and up.katakana_id = r.id
        )
    ) as rule_count,
    (select coalesce(sum(row_count), 0)::integer from forecast_kana_types) as example_count;
$function$;

grant execute on function public.get_hiragana_rule_forecast(uuid, integer) to authenticated;
grant execute on function public.get_katakana_rule_forecast(uuid, integer) to authenticated;
