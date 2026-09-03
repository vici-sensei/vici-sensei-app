-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Makes passing the katakana reading test (100% on user_reading_test_progress, test_type =
-- 'katakana' -- see 20260919_test_katakana_words.sql) a second requirement for moving off the kana
-- track onto standard (kanji/vocabulary), alongside the hiragana+katakana mastery check that
-- already existed -- the same pattern 20260915_reading_test_gates_katakana.sql already applied one
-- step earlier, for hiragana -> katakana. Extends katakana_auto_activate_standard (the trigger
-- that already gates this purely on mastery) and adds a mirror trigger from the reading-test side.
--
-- Unlike the hiragana -> katakana step, there's no manual toggle to guard here: study_track only
-- ever flips to 'standard' via this trigger or the pre-existing, deliberately ungated "switch to
-- standard early" escape hatch in Settings (StudySettingsForm's toggleStudyKanji/
-- toggleStudyVocabulary, which set study_track: 'standard' outright with no mastery check at all,
-- same as before this migration) -- left untouched, since gating that would be a new restriction
-- on an existing feature, not a mirror of anything the hiragana -> katakana step already gates.

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
    ) >= (select count(*) from public.katakana where entry_kind != 'rule' and study_enabled)
    and (
      select count(*) from public.user_hiragana_progress p
      where p.user_id = new.user_id and p.status in ('review', 'relearning')
    ) >= (select count(*) from public.hiragana where entry_kind != 'rule' and study_enabled)
    and public.reading_test_passed(new.user_id, 'katakana')
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

-- The mirror image of the trigger above: fires when a reading-test answer lands, in case THIS is
-- what completes the gate (the normal case -- katakana is mastered first, which prompts the
-- test, same order the hiragana -> katakana step already documents).
create or replace function public.reading_test_progress_activates_standard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.test_type = 'katakana' and public.reading_test_passed(new.user_id, 'katakana') then
    if (
      select count(*) from public.user_katakana_progress p
      where p.user_id = new.user_id and p.status in ('review', 'relearning')
    ) >= (select count(*) from public.katakana where entry_kind != 'rule' and study_enabled)
    and (
      select count(*) from public.user_hiragana_progress p
      where p.user_id = new.user_id and p.status in ('review', 'relearning')
    ) >= (select count(*) from public.hiragana where entry_kind != 'rule' and study_enabled)
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

create trigger reading_test_progress_activates_standard_trigger
  after insert or update on public.user_reading_test_progress
  for each row execute function public.reading_test_progress_activates_standard();
