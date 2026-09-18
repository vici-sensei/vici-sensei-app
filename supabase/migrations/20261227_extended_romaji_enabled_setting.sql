-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Lets a student opt into "extended romaji" for kana reading cards (the typed-answer cards for
-- hiragana and katakana): when true, an answer is correct if it equals the row's romaji OR any
-- value of its extended_romaji (see 20261226_add_extended_romaji_to_kana_tables.sql); when false
-- (the default), only romaji counts, exactly as before. Purely a client-side preference read by
-- the settings form and ReviewCardKanaReading -- nothing server-side depends on it, so a plain
-- column (no trigger, no RPC change) is enough, same as kana_practice_enabled
-- (20261018_kana_practice_mode_setting.sql).

alter table public.user_study_settings
  add column if not exists extended_romaji_enabled boolean not null default false;

comment on column public.user_study_settings.extended_romaji_enabled is 'When true, kana reading cards also accept every value of hiragana.extended_romaji / katakana.extended_romaji as a correct answer, on top of romaji. Default false = romaji only.';
