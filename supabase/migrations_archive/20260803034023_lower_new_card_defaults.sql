-- Run this manually in the Supabase SQL editor.
--
-- Lowers the default daily new-card load for new users: new_kanji_per_day
-- 2 -> 1, new_vocab_per_day 12 -> 6 (still the 6:1 ratio enforced by
-- sync_new_vocab_per_day_trigger). Only affects rows inserted after this
-- runs -- existing users keep whatever values they already have.

alter table public.user_study_settings
  alter column new_kanji_per_day set default 1;

alter table public.user_study_settings
  alter column new_vocab_per_day set default 6;
