-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Kana learning track, phase 1 (cont'd): user_study_settings gets a study_track
-- column ('kana'/'standard') plus the toggles/daily-caps for the two kana sets.
--
-- The separation between tracks is enforced structurally with a CHECK constraint,
-- not just in the UI: while study_track = 'kana', study_kanji/study_vocabulary must
-- both be false; while study_track = 'standard', study_hiragana/study_katakana must
-- both be false. get_due_cards (phase 2) additionally reads study_track server-side
-- so a stale/forged client flag can't leak the wrong track's cards either.
--
-- study_hiragana/study_katakana default to false (not true/false as a kana student
-- would eventually see them) because study_track itself defaults to 'standard' at
-- the column level (see product decision: no backfill needed, no real users yet) --
-- a fresh row must satisfy the separation check above, which requires both false on
-- 'standard'. The onboarding "No" step and Settings' "Resume kana" switch are what
-- actually turn study_hiragana on, in the same statement that flips study_track.
--
-- enabled_levels is separately locked to exactly ['N5'] while on kana -- the level
-- selector doesn't render in Settings on that track, but this is the DB-level
-- backstop the plan calls for.

alter table public.user_study_settings
  add column study_track text not null default 'standard'
    check (study_track = any (array['kana', 'standard'])),
  add column study_hiragana boolean not null default false,
  add column study_katakana boolean not null default false,
  add column new_hiragana_per_day integer not null default 5,
  add column new_katakana_per_day integer not null default 5;

alter table public.user_study_settings
  add constraint user_study_settings_track_separation_check
  check (
    (study_track = 'kana' and study_kanji = false and study_vocabulary = false)
    or
    (study_track = 'standard' and study_hiragana = false and study_katakana = false)
  );

alter table public.user_study_settings
  add constraint user_study_settings_kana_level_check
  check (study_track <> 'kana' or enabled_levels = array['N5']::text[]);

alter table public.review_logs
  drop constraint review_logs_exercise_type_check;

alter table public.review_logs
  add constraint review_logs_exercise_type_check
  check (exercise_type = any (array['kanji_meaning', 'kanji_reading', 'vocab_meaning', 'hiragana_reading', 'katakana_reading']));
