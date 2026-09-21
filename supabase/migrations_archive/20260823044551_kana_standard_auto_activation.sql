-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Kana learning track, next link in the chain: once every hiragana AND every
-- katakana character has graduated (status review/relearning) for a user, the
-- kana track is complete -- flip study_track to 'standard' and turn
-- study_kanji/study_vocabulary on, turning study_hiragana/study_katakana off in
-- the same statement (required atomically by
-- user_study_settings_track_separation_check). Modeled directly on
-- hiragana_auto_activate_katakana() (20260822_kana_katakana_auto_activation.sql,
-- as fixed by 20260823_hiragana_katakana_resume_fix.sql); this fires on
-- user_katakana_progress instead of user_hiragana_progress, and additionally
-- requires hiragana to be fully mastered too (hiragana is already a prerequisite
-- for study_katakana ever turning on, but re-checking it here keeps this trigger
-- correct on its own rather than relying on that invariant holding).
--
-- Only acts on the specific row transition that adds a newly-mastered katakana
-- card to the count (old.status not yet 'review'/'relearning' -- per
-- compute_review_result a row's status is sticky within {review, relearning}
-- once it first arrives there, so this is true at most once per row, ever). That
-- makes the whole trigger fire at most once per student, at the exact moment the
-- last katakana character crosses into mastery -- same one-shot shape as the
-- fixed hiragana trigger, so a student who later turns study_kanji or
-- study_vocabulary back off has that choice stick.
--
-- Unlike the hiragana -> katakana step, no separate "resume on switch back"
-- trigger is needed here: get_due_cards only ever surfaces kanji_meaning/
-- kanji_reading/vocab_meaning while study_track = 'standard', and only
-- hiragana_reading/katakana_reading while study_track = 'kana'. So once a
-- student switches back to kana, no further UPDATEs land on
-- user_katakana_progress until they switch back to standard again -- there's no
-- recurring event that could re-fire (or that would need to) this trigger.

create or replace function public.katakana_auto_activate_standard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status = 'review' and old.status not in ('review', 'relearning') then
    if (
      select count(*) from public.user_katakana_progress p
      where p.user_id = new.user_id and p.status in ('review', 'relearning')
    ) >= (select count(*) from public.katakana)
    and (
      select count(*) from public.user_hiragana_progress p
      where p.user_id = new.user_id and p.status in ('review', 'relearning')
    ) >= (select count(*) from public.hiragana)
    then
      update public.user_study_settings
      set study_track = 'standard',
          study_kanji = true,
          study_vocabulary = true,
          study_hiragana = false,
          study_katakana = false
      where user_id = new.user_id and study_track = 'kana';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists katakana_auto_activate_standard_trigger on public.user_katakana_progress;

create trigger katakana_auto_activate_standard_trigger
  after update on public.user_katakana_progress
  for each row execute function katakana_auto_activate_standard();
