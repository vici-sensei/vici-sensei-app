-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Closes a gap in /settings/study: StudySettingsForm's "Study katakana" toggle
-- (toggleStudyKatakana) can set study_katakana = true directly -- either as a plain flip on
-- the kana track, or via handleCrossTrack when switching over from the standard track -- with
-- no check against hiragana progress at all. The only thing that was ever supposed to gate
-- katakana behind hiragana was hiragana_auto_activate_katakana()'s auto-flip
-- (20260823_hiragana_katakana_resume_fix.sql), but that's a one-time default, not a hard
-- constraint -- it never stopped a student from switching katakana on manually from day one.
--
-- This trigger blocks any UPDATE that turns study_katakana on (old value not true -> true)
-- unless every hiragana character is already mastered (status in review/relearning) for that
-- user. It only fires on that false->true transition, so an already-true row staying true
-- across an unrelated field update is never re-validated -- same "sticks once set" scoping as
-- hiragana_auto_activate_katakana() itself.
--
-- Both triggers that legitimately set study_katakana = true server-side --
-- hiragana_auto_activate_katakana() and resume_katakana_on_kana_return() -- already verify the
-- exact same "all hiragana mastered" condition themselves before doing so, so this guard is a
-- no-op for them and only actually blocks the previously-ungated manual path through Settings.

create or replace function public.enforce_katakana_requires_hiragana_mastered()
returns trigger
language plpgsql
as $function$
begin
  if new.study_katakana = true and old.study_katakana is distinct from true then
    if (
      select count(*) from public.user_hiragana_progress p
      where p.user_id = new.user_id and p.status in ('review', 'relearning')
    ) < (select count(*) from public.hiragana)
    then
      raise exception 'Finish learning all hiragana before you can start katakana.';
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists enforce_katakana_requires_hiragana_trigger on public.user_study_settings;

create trigger enforce_katakana_requires_hiragana_trigger
  before update on public.user_study_settings
  for each row execute function enforce_katakana_requires_hiragana_mastered();
