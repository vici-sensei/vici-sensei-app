-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Follow-up to 20261114_jmdict_entries_table.sql. The flattened columns on jmdict_entries
-- (meanings, parts_of_speech, fields, dialects, misc_notes, info_notes, ...) mirror
-- public.vocabulary's shape, but that flattening loses which meaning/part-of-speech/field
-- belongs to which JMdict "sense" -- a word with several distinct senses (e.g. "circle" vs.
-- "period/full stop" for the same headword) ends up with all its glosses merged into one array.
-- This column preserves the original per-sense grouping losslessly, as a companion to (not a
-- replacement for) the flattened columns.
--
-- Populated by a follow-up `node scripts/import-jmdict.mjs ... --mode=update-senses` pass (see
-- that script) against the 218,732 rows already inserted by the previous migration -- not part
-- of this DDL-only file.

alter table public.jmdict_entries
  add column senses jsonb not null default '[]'::jsonb;

comment on column public.jmdict_entries.senses is 'Full per-sense structure preserved verbatim from the source, as a companion to the flattened meanings/parts_of_speech/fields/dialects/misc_notes/info_notes/related_words/antonyms columns (which merge all senses together and lose the grouping). Each array element is one JMdict sense: {partOfSpeech, field, dialect, misc, info, related, antonym, languageSource, gloss}, with partOfSpeech/field/dialect/misc tag codes expanded to long-form English same as elsewhere on this table. gloss is [{lang, gender, type, text}] verbatim from the source.';
