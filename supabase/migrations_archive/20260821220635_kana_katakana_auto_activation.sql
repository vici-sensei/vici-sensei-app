-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Once every hiragana character has graduated (status review/relearning) for a
-- user, study_katakana flips on automatically -- no confirmation, pure backend.
-- Modeled on leaderboard_stats_on_new_card()'s trigger-function shape; the logic
-- itself is new.
--
-- Fires on every UPDATE that lands a row at status = 'review' (not just the first
-- transition into it), so it's self-correcting: if a student switches away to the
-- standard track (which forces study_katakana back to false via the separation
-- CHECK) and later resumes kana, the very next successful hiragana review
-- re-activates katakana rather than leaving it stuck off. The WHERE guard on the
-- UPDATE below (study_track = 'kana') keeps this safe to fire even while the user
-- is on the standard track -- it's simply a no-op then, never a constraint
-- violation, since 'standard' rows require study_katakana = false.

create or replace function public.hiragana_auto_activate_katakana()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.status = 'review' then
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

create trigger hiragana_auto_activate_katakana_trigger
  after update on public.user_hiragana_progress
  for each row execute function hiragana_auto_activate_katakana();
