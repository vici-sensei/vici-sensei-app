-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Full JMdict (Japanese-English dictionary) reference data, imported once from the JMdict-
-- simplified JSON export and never written to by the app. Column shape deliberately mirrors
-- public.vocabulary (word, kana_reading, meanings, parts_of_speech, ids_kanji, other_readings,
-- is_common_jisho, usually_kana, study_enabled, ...) so the two tables feel like the same family
-- and a future migration of curated rows from here into vocabulary is a straight column copy.
-- Columns vocabulary has that raw JMdict cannot supply (romaji_reading, furiganas,
-- romaji_furiganas, jlpt_level, maximum_jlpt_level_of_individual_kanji, frequency_number,
-- frequency_number_estimated) are kept for structural parity but always NULL/empty here --
-- see column comments. study_enabled defaults to false here (unreviewed raw data), unlike
-- vocabulary's true default.
--
-- Multi-valued JMdict data (multiple senses, each with its own gloss/partOfSpeech/field/etc.)
-- is flattened+deduped into arrays per entry, the same way vocabulary.meanings/parts_of_speech
-- already flatten across senses -- this loses which meaning belongs to which sense, matching
-- vocabulary's existing trade-off rather than introducing a new one.
--
-- All short tag codes from the source file's top-level `tags` map (e.g. "v5u" ->
-- "Godan verb with 'u' ending") are expanded to their long-form English description before
-- insertion: kanji/kana tags folded into is_common_jisho/usually_kana derivation,
-- sense.partOfSpeech/field/dialect/misc expanded into the arrays below. See
-- scripts/import-jmdict.mjs, which generates the INSERT batches applied after this migration.

create table public.jmdict_entries (
  id bigint generated always as identity primary key,
  jmdict_id text not null unique,
  word text,
  kana_reading text not null,
  romaji_reading text,
  meanings text[] not null default '{}',
  parts_of_speech text[] not null default '{}',
  ids_kanji bigint[] not null default '{}',
  furiganas text[] not null default '{}',
  romaji_furiganas text[] not null default '{}',
  other_readings text[] not null default '{}',
  jlpt_level text,
  maximum_jlpt_level_of_individual_kanji text,
  is_common_jisho boolean not null default false,
  usually_kana boolean not null default false,
  frequency_number integer,
  frequency_number_estimated integer,
  study_enabled boolean not null default false,
  fields text[] not null default '{}',
  dialects text[] not null default '{}',
  misc_notes text[] not null default '{}',
  info_notes text[] not null default '{}',
  related_words text[] not null default '{}',
  antonyms text[] not null default '{}',
  source_version text not null,
  source_date date,
  created_at timestamptz not null default now(),
  constraint jmdict_entries_meanings_not_empty check (cardinality(meanings) > 0),
  constraint jmdict_entries_jlpt_level_check check (jlpt_level is null or jlpt_level = any(array['N5','N4','N3','N2','N1']))
);

create index idx_jmdict_entries_word on public.jmdict_entries (word);
create index idx_jmdict_entries_kana_reading on public.jmdict_entries (kana_reading);
create index idx_jmdict_entries_word_trgm on public.jmdict_entries using gin (word extensions.gin_trgm_ops);
create index idx_jmdict_entries_kana_reading_trgm on public.jmdict_entries using gin (kana_reading extensions.gin_trgm_ops);

comment on table public.jmdict_entries is 'Full JMdict dictionary, one row per entry, imported once from the JMdict-simplified JSON export. Column shape mirrors public.vocabulary; see scripts/import-jmdict.mjs for the transform.';
comment on column public.jmdict_entries.jmdict_id is 'Original numeric entry id from the source JSON''s "id" field, kept as text to match the source verbatim.';
comment on column public.jmdict_entries.romaji_reading is 'Always NULL -- JMdict has no romaji field; would need a transliteration pass to populate.';
comment on column public.jmdict_entries.furiganas is 'Always empty -- JMdict does not provide kanji/kana alignment.';
comment on column public.jmdict_entries.romaji_furiganas is 'Always empty, same reason as furiganas.';
comment on column public.jmdict_entries.jlpt_level is 'Always NULL -- not present in raw JMdict; kept for parity with vocabulary and forward compatibility.';
comment on column public.jmdict_entries.maximum_jlpt_level_of_individual_kanji is 'Always NULL, same reason as jlpt_level.';
comment on column public.jmdict_entries.frequency_number is 'Always NULL -- not present in JMdict.';
comment on column public.jmdict_entries.frequency_number_estimated is 'Always NULL, same reason.';
comment on column public.jmdict_entries.fields is 'Deduped union of sense[].field across all senses, expanded to long-form English (e.g. "computing"). Not present on vocabulary.';
comment on column public.jmdict_entries.dialects is 'Deduped union of sense[].dialect across all senses, expanded to long-form English. Not present on vocabulary.';
comment on column public.jmdict_entries.misc_notes is 'Deduped union of sense[].misc across all senses, expanded to long-form English (usage notes: archaic, rare, derogatory, etc). Not present on vocabulary.';
comment on column public.jmdict_entries.info_notes is 'Deduped union of sense[].info across all senses (free-text notes, not tag codes). Not present on vocabulary.';
comment on column public.jmdict_entries.related_words is 'Deduped headword text of each sense[].related cross-reference. Not present on vocabulary.';
comment on column public.jmdict_entries.antonyms is 'Deduped headword text of each sense[].antonym cross-reference. Not present on vocabulary.';
comment on column public.jmdict_entries.source_version is 'JMdict-simplified "version" field from the imported file, e.g. "3.6.2".';
comment on column public.jmdict_entries.source_date is 'JMdict-simplified "dictDate" field from the imported file.';

alter table public.jmdict_entries enable row level security;

create policy "Authenticated users can read jmdict_entries"
  on public.jmdict_entries for select
  to authenticated
  using (true);
