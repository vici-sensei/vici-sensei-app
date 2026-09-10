-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Mirrors the study_enabled column already on hiragana/katakana so vocabulary rows can be
-- excluded from study without deleting them.

alter table public.vocabulary
  add column study_enabled boolean not null default true;
