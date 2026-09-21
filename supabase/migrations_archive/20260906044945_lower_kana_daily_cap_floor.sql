-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Lowers the floor on new_hiragana_per_day/new_katakana_per_day from 15 to 5 (still a
-- multiple of 5), so a user who wants a lighter daily kana load can dial down to 5 instead of
-- being stuck at 15 -- matches the Settings page stepper's new KANA_MIN. The default for
-- newly onboarded kana-track users stays 15 (column default untouched); only the floor moves.
--
-- get_new_card_caps' ceiling for both columns also floors at the new minimum (5, was 15) so
-- the floor and ceiling can never contradict each other if hiragana/katakana content ever
-- shrank below 15 rows.
--
-- hiragana_max/katakana_max's totals now also filter on study_enabled, not just
-- entry_kind != 'rule' -- get_new_hiragana_candidates/get_new_katakana_candidates (the actual
-- selection logic new cards are drawn from, 20260902_harden_new_card_introduction.sql) already
-- restrict to h.study_enabled/k.study_enabled, so a disabled row was never actually
-- introducible in the first place. Counting it anyway inflated the ceiling past what a user
-- could ever really fill (129/196 raw rows vs. 81/91 study_enabled ones), letting
-- new_hiragana_per_day/new_katakana_per_day sit on a value that looked valid but could never
-- be reached. Floored to a multiple of 5 this now yields 80/90 instead of 125/195.

alter table public.user_study_settings
  drop constraint user_study_settings_new_hiragana_per_day_check,
  drop constraint user_study_settings_new_katakana_per_day_check;

alter table public.user_study_settings
  add constraint user_study_settings_new_hiragana_per_day_check
  check (new_hiragana_per_day >= 5 and new_hiragana_per_day % 5 = 0),
  add constraint user_study_settings_new_katakana_per_day_check
  check (new_katakana_per_day >= 5 and new_katakana_per_day % 5 = 0);

create or replace function public.get_new_card_caps()
returns table(kanji_max integer, vocab_max integer, hiragana_max integer, katakana_max integer)
language sql
stable
as $function$
  with totals as (
    select
      (select count(*) from public.kanji) as kanji_total,
      (select count(*) from public.vocabulary) as vocab_total,
      (select count(*) from public.hiragana where entry_kind != 'rule' and study_enabled) as hiragana_total,
      (select count(*) from public.katakana where entry_kind != 'rule' and study_enabled) as katakana_total
  ),
  -- Kanji and vocab are locked at a 1:6 ratio by sync_new_vocab_per_day_trigger -- deriving
  -- vocab_max as kanji_max * 6 (rather than capping each independently against its own table)
  -- means whichever column that trigger computes from the other always lands within its own
  -- table's real size too.
  kanji as (
    select greatest(least(kanji_total, floor(vocab_total::numeric / 6)::integer), 1) as kanji_max
    from totals
  )
  select
    kanji.kanji_max,
    kanji.kanji_max * 6 as vocab_max,
    greatest(floor(totals.hiragana_total::numeric / 5)::integer * 5, 5) as hiragana_max,
    greatest(floor(totals.katakana_total::numeric / 5)::integer * 5, 5) as katakana_max
  from totals, kanji;
$function$;
