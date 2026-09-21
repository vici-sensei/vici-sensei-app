-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Adds a curated "headline" meaning to public.vocabulary, mirroring the columns
-- jmdict_entries.primary_meanings/other_meanings already carry (see
-- 20261123_jmdict_entries_primary_other_meanings.sql and
-- 20261126_jmdict_entries_meanings_as_arrays.sql) -- vocabulary.meanings flattens every JMdict
-- sense together with no ordering signal, same problem primary_meanings/other_meanings on
-- jmdict_entries already solved.
--
-- No trigger, no FK: vocabulary.id isn't referenced by a scalar column on jmdict_entries (it's an
-- element of the jmdict_entries.vocabulary_ids array), so there's nothing Postgres can enforce
-- automatically here. Kept in sync from application code instead -- updateJmdictEntrySenses in
-- lib/data/jmdictSenses.ts writes these columns for every public.vocabulary.id referenced by a
-- jmdict_entries row's vocabulary_ids right after a senses save recomputes that row's own
-- primary_meanings/other_meanings (via the existing sync_jmdict_entries_primary_other_meanings
-- trigger). A vocabulary_ids change made outside that flow -- a raw SQL/migration edit, since
-- there is currently no admin UI for linking/unlinking -- will NOT re-trigger this sync; re-run
-- the equivalent of the backfill in 20261130_vocabulary_primary_other_meanings_backfill.sql
-- manually if that ever happens.
--
-- Both columns default to NULL (not '{}'/'[]') -- NULL means "no linked jmdict_entries row yet",
-- distinct from a linked row whose own other_meanings is legitimately empty (single-sense word),
-- which backfills to '[]'::jsonb.
--
-- DDL only -- see the accompanying backfill statement run separately.

alter table public.vocabulary
  add column primary_meanings text[],
  add column other_meanings jsonb;

comment on column public.vocabulary.primary_meanings is 'Copied from jmdict_entries.primary_meanings for the linked row(s) (jmdict_entries.vocabulary_ids contains this vocabulary.id). NULL until a linked jmdict_entries row exists. When more than one jmdict_entries row shares this vocabulary id (e.g. two distinct senses under one reading), their primary_meanings are concatenated in jmdict_entries.id order. Kept in sync from application code (lib/data/jmdictSenses.ts), not a DB trigger -- see file header.';
comment on column public.vocabulary.other_meanings is 'Copied from jmdict_entries.other_meanings for the linked row(s), same shape (jsonb array of arrays, one inner array per non-primary sense). NULL until a linked jmdict_entries row exists; ''[]''::jsonb once linked but the linked row(s) have no secondary senses. Kept in sync from application code (lib/data/jmdictSenses.ts), not a DB trigger -- see file header.';

-- Same enforcement pattern as every other admin-editable vocabulary column (see
-- 20261117_jmdict_entries_admin_update_policy.sql, 20261120_jmdict_review_queue_includes_resolved.sql)
-- -- column-scoped grant; the existing is_admin()-gated "Admins can update vocabulary
-- jmdict_match_reviewed" RLS policy already covers the row-level check for any UPDATE on this
-- table, RLS policies aren't column-scoped.
grant update (primary_meanings, other_meanings) on public.vocabulary to authenticated;
