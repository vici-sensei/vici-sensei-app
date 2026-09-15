-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Adds a curated "headline" meaning alongside the existing flattened meanings column.
-- meanings mixes every JMdict sense's glosses into one array with no indication of which
-- one is most important; primary_meanings picks out the first (most prominent) sense's
-- gloss text as a single string, and other_meanings holds the rest, flattened the same
-- way meanings already is. Default population trusts JMdict's own sense ordering --
-- manual review across 110 multi-sense jmdict_entries rows (see project notes) found
-- that ordering correct in all but one case, so it is not worth second-guessing row by
-- row without stronger signal than a small sample.
--
-- DDL only -- see the accompanying backfill statement run separately against rows where
-- vocabulary_ids is populated (the curated subset actually surfaced in the app).

alter table public.jmdict_entries
  add column primary_meanings text,
  add column other_meanings text[] not null default '{}';

comment on column public.jmdict_entries.primary_meanings is 'Gloss text of the first (most prominent) sense in senses, comma-joined -- a curated single "headline" meaning, unlike meanings which flattens every sense together with no ordering signal. NULL until backfilled.';
comment on column public.jmdict_entries.other_meanings is 'Gloss text from every sense other than the one used for primary_meanings, flattened the same way meanings is. Empty array for single-sense entries or before backfill.';
