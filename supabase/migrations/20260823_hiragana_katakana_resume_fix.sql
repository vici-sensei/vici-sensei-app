-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Fixes a bug in hiragana_auto_activate_katakana() (20260822_kana_katakana_auto_activation.sql):
-- it re-fired on EVERY successful review that landed a hiragana row at status =
-- 'review', not just the review that first completed the set. Once all hiragana
-- were mastered, any later successful review of an already-mastered card
-- (which happens constantly under spaced repetition) re-ran the "all mastered?"
-- check, found it still true, and force-set study_katakana back to true --
-- silently undoing a student's manual "turn katakana off" choice in Settings,
-- over and over, for as long as they kept reviewing hiragana.
--
-- Fix: only act on the specific row transition that adds a newly-mastered card
-- to the count -- i.e. old.status was not yet 'review'/'relearning' (per
-- compute_review_result, a row's status is sticky within {review, relearning}
-- once it first arrives there, so this condition is true at most once per row,
-- ever). That makes the whole trigger fire at most once per student: the exact
-- moment the last hiragana character crosses into mastery. Anything the student
-- sets in Settings afterwards -- including turning katakana back off -- sticks.
--
-- That removes the trigger's old "self-correcting" behavior for the track-switch-
-- and-back case (switching to standard forces study_katakana back to false via
-- the separation CHECK; the old trigger relied on the next hiragana review to
-- silently restore it). resume_katakana_on_kana_return() below replaces that with
-- a narrower, one-time check that only runs at the moment of the switch itself.

create or replace function public.hiragana_auto_activate_katakana()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status = 'review' and old.status not in ('review', 'relearning') then
    if (
      select count(*) from public.user_hiragana_progress p
      where p.user_id = new.user_id and p.status in ('review', 'relearning')
    ) >= (select count(*) from public.hiragana)
    then
      update public.user_study_settings
      set study_katakana = true
      where user_id = new.user_id and study_track = 'kana' and study_katakana = false;
    end if;
  end if;
  return new;
end;
$function$;

-- Restores katakana specifically at the moment a student switches back to the
-- kana track (study_track: 'standard' -> 'kana'), if hiragana was already fully
-- mastered before -- same intent as the old self-correcting behavior, but tied to
-- the actual event that resets study_katakana (the track switch), not to
-- unrelated hiragana reviews that happen afterwards. A student who then turns
-- katakana back off manually keeps that choice, since nothing fires again until
-- the next standard -> kana switch.
--
-- BEFORE UPDATE + mutating new.study_katakana directly (same pattern as
-- sync_new_vocab_per_day()) so this is one atomic write, not a second UPDATE --
-- and no security definer needed, since it only ever touches the row already
-- being written under the caller's own RLS grant.
create or replace function public.resume_katakana_on_kana_return()
returns trigger
language plpgsql
as $function$
begin
  if old.study_track = 'standard' and new.study_track = 'kana' and new.study_katakana = false then
    if (
      select count(*) from public.user_hiragana_progress p
      where p.user_id = new.user_id and p.status in ('review', 'relearning')
    ) >= (select count(*) from public.hiragana)
    then
      new.study_katakana := true;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists resume_katakana_on_kana_return_trigger on public.user_study_settings;

create trigger resume_katakana_on_kana_return_trigger
  before update on public.user_study_settings
  for each row execute function resume_katakana_on_kana_return();
