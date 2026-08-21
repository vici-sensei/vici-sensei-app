-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- suspendCard only ever wrote status = 'suspended', overwriting whatever the card's real
-- phase was (new/learning/review/relearning) with nothing to recover it from -- due_at,
-- interval_days, repetitions etc. all survive suspension untouched, but the phase itself was
-- gone. That left "Reset progress" (which forgets the card entirely, see lib/data/cards.ts)
-- as the only way off a suspended card. Adding status_before lets suspend snapshot the phase
-- it's about to overwrite, so a reactivate action can restore it exactly.

alter table public.user_kanji_meaning_progress
  add column status_before text null;
alter table public.user_kanji_meaning_progress
  add constraint user_kanji_meaning_progress_status_before_check
  check (status_before is null or status_before = any (array['new', 'learning', 'review', 'relearning']));

alter table public.user_kanji_reading_progress
  add column status_before text null;
alter table public.user_kanji_reading_progress
  add constraint user_kanji_reading_progress_status_before_check
  check (status_before is null or status_before = any (array['new', 'learning', 'review', 'relearning']));

alter table public.user_vocabulary_progress
  add column status_before text null;
alter table public.user_vocabulary_progress
  add constraint user_vocabulary_progress_status_before_check
  check (status_before is null or status_before = any (array['new', 'learning', 'review', 'relearning']));
