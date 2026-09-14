-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Links each public.jmdict_entries row to at most one public.vocabulary row (enforced by the
-- unique constraint below -- a vocabulary row can correspond to only one JMdict entry). Most
-- jmdict_entries rows will have vocabulary_id NULL, since vocabulary (17,349 rows) is a small
-- curated subset of the full JMdict import (218,732 rows). See scripts/link-vocabulary-jmdict.mjs
-- for how vocabulary_id gets populated -- match_method records how each link was established,
-- since matching Japanese homographs/homophones by word+reading alone is sometimes ambiguous.

alter table public.jmdict_entries
  add column vocabulary_id bigint references public.vocabulary(id),
  add column match_method text;

alter table public.jmdict_entries
  add constraint jmdict_entries_vocabulary_id_unique unique (vocabulary_id);

alter table public.jmdict_entries
  add constraint jmdict_entries_match_method_check
  check (match_method is null or match_method = any(array['exact','ambiguous_resolved_by_meaning','manual']));

create index idx_jmdict_entries_vocabulary_id on public.jmdict_entries (vocabulary_id);

comment on column public.jmdict_entries.vocabulary_id is 'FK to public.vocabulary.id. NULL when no corresponding vocabulary row exists. Unique -- at most one jmdict_entries row per vocabulary row.';
comment on column public.jmdict_entries.match_method is 'How vocabulary_id was determined: exact (unique word+kana_reading candidate), ambiguous_resolved_by_meaning (multiple candidates existed, picked automatically by comparing vocabulary.meanings against each candidate), manual (user chose via review). NULL when vocabulary_id is NULL.';
