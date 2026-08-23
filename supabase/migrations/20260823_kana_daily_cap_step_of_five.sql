-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Raises the default daily new-card load for the kana track: new_hiragana_per_day
-- and new_katakana_per_day 5 -> 15. Only affects rows inserted after this runs --
-- existing users keep whatever values they already have, same precedent as
-- 20260803_lower_new_card_defaults.sql for the kanji/vocab pair.
--
-- Also locks both columns to multiples of 5, floored at 15, matching the Settings
-- page stepper (StudySettingsForm's adjustHiragana/adjustKatakana, which now move
-- in steps of 5 and floor at 15, never below it) -- a structural backstop the same
-- way user_study_settings_track_separation_check backs the track toggles, so a
-- direct write (RPC, SQL editor, forged client payload) can't land a value the UI
-- would never produce.
--
-- Normalizes any existing rows that don't already conform (e.g. a value set by
-- the old 1-per-click stepper, or the old 5-per-day floor) before the CHECK is
-- added, since ADD CONSTRAINT validates existing data by default and would
-- otherwise fail on them.

update public.user_study_settings
set new_hiragana_per_day = greatest(15, round(new_hiragana_per_day / 5.0) * 5)
where new_hiragana_per_day < 15 or new_hiragana_per_day % 5 <> 0;

update public.user_study_settings
set new_katakana_per_day = greatest(15, round(new_katakana_per_day / 5.0) * 5)
where new_katakana_per_day < 15 or new_katakana_per_day % 5 <> 0;

alter table public.user_study_settings
  alter column new_hiragana_per_day set default 15,
  alter column new_katakana_per_day set default 15;

alter table public.user_study_settings
  add constraint user_study_settings_new_hiragana_per_day_check
  check (new_hiragana_per_day >= 15 and new_hiragana_per_day % 5 = 0),
  add constraint user_study_settings_new_katakana_per_day_check
  check (new_katakana_per_day >= 15 and new_katakana_per_day % 5 = 0);
