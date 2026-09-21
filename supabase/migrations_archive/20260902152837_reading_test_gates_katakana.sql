-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Makes passing the hiragana reading test (100% on user_reading_test_progress, see
-- 20260915_user_reading_test_progress.sql) a second requirement for katakana, alongside the
-- hiragana-mastery check that already existed. Extends the three existing triggers that
-- gate/activate katakana purely on hiragana mastery, and adds a fourth mirroring them from the
-- reading-test side.

-- Manual toggle guard (Settings page) -- now also requires the test.
create or replace function public.enforce_katakana_requires_hiragana_mastered()
 returns trigger
 language plpgsql
as $function$
begin
  if new.study_katakana = true and old.study_katakana is distinct from true then
    if (
      select count(*) from public.user_hiragana_progress p
      where p.user_id = new.user_id and p.status in ('review', 'relearning')
    ) < (select count(*) from public.hiragana where entry_kind != 'rule' and study_enabled)
    or not public.reading_test_passed(new.user_id, 'hiragana')
    then
      raise exception 'Finish learning all hiragana and pass the reading test before you can start katakana.';
    end if;
  end if;
  return new;
end;
$function$;

-- Re-crossing from standard back to kana -- would otherwise silently re-enable katakana on
-- hiragana mastery alone, bypassing the test.
create or replace function public.resume_katakana_on_kana_return()
 returns trigger
 language plpgsql
as $function$
begin
  if old.study_track = 'standard' and new.study_track = 'kana' and new.study_katakana = false then
    if (
      select count(*) from public.user_hiragana_progress p
      where p.user_id = new.user_id and p.status in ('review', 'relearning')
    ) >= (select count(*) from public.hiragana where entry_kind != 'rule' and study_enabled)
    and public.reading_test_passed(new.user_id, 'hiragana')
    then
      new.study_katakana := true;
    end if;
  end if;
  return new;
end;
$function$;

-- Fires on hiragana mastery -- now a no-op until the test is also passed. Still correctly fires
-- if hiragana is re-mastered after a regression while the test was already passed earlier.
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
    ) >= (select count(*) from public.hiragana where entry_kind != 'rule' and study_enabled)
    and public.reading_test_passed(new.user_id, 'hiragana')
    then
      update public.user_study_settings
      set study_katakana = true
      where user_id = new.user_id and study_track = 'kana' and study_katakana = false;
    end if;
  end if;
  return new;
end;
$function$;

-- The mirror image of the trigger above: fires when a reading-test answer lands, in case THIS is
-- what completes the 100% (the normal case -- hiragana is mastered first, which prompts the test).
create or replace function public.reading_test_progress_activates_katakana()
 returns trigger
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
begin
  if new.test_type = 'hiragana' and public.reading_test_passed(new.user_id, 'hiragana') then
    if (
      select count(*) from public.user_hiragana_progress p
      where p.user_id = new.user_id and p.status in ('review', 'relearning')
    ) >= (select count(*) from public.hiragana where entry_kind != 'rule' and study_enabled)
    then
      update public.user_study_settings
      set study_katakana = true
      where user_id = new.user_id and study_track = 'kana' and study_katakana = false;
    end if;
  end if;
  return new;
end;
$function$;

create trigger reading_test_progress_activates_katakana_trigger
  after insert or update on public.user_reading_test_progress
  for each row execute function public.reading_test_progress_activates_katakana();
