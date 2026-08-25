-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Closes the mirror-image gap of 20260825_enforce_katakana_requires_hiragana.sql: that
-- migration stops study_katakana from being turned ON before every hiragana character is
-- mastered, but nothing stopped it from silently staying ON if a hiragana character later
-- regresses back out of mastery. That's reachable in practice via undoReview()
-- (lib/data/reviews.ts) -- a plain UPDATE that restores a progress row's status/etc. from
-- review_logs' *_before snapshot, with no trigger reacting to the resulting status change. If a
-- student undoes the exact review that graduated their last hiragana character, their hiragana
-- progress drops back below 100% while study_katakana (already flipped on by
-- hiragana_auto_activate_katakana) stays true in the DB -- so StudySettingsForm's toggle shows
-- "off" (it forces the display off whenever hiragana isn't mastered) while the actual /study
-- queue (get_due_cards / get_new_katakana_candidates, both gated on the real column) keeps
-- serving katakana cards regardless. This trigger makes the DB column match the display instead
-- of leaving that up to the client to paper over.
--
-- Fires only on the exact reverse of hiragana_auto_activate_katakana's own guard (a row leaving
-- review/relearning), so normal SRS traffic never touches it -- compute_review_result only ever
-- moves a review-track row between 'review' and 'relearning', never back out to
-- 'learning'/'new'. Only undo, or any future manual reset/reactivate path, can trigger this.

create or replace function public.hiragana_regression_disables_katakana()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if old.status in ('review', 'relearning') and new.status not in ('review', 'relearning') then
    if (
      select count(*) from public.user_hiragana_progress p
      where p.user_id = new.user_id and p.status in ('review', 'relearning')
    ) < (select count(*) from public.hiragana)
    then
      update public.user_study_settings
      set study_katakana = false
      where user_id = new.user_id and study_katakana = true;
    end if;
  end if;
  return new;
end;
$function$;

drop trigger if exists hiragana_regression_disables_katakana_trigger on public.user_hiragana_progress;

create trigger hiragana_regression_disables_katakana_trigger
  after update on public.user_hiragana_progress
  for each row execute function hiragana_regression_disables_katakana();
