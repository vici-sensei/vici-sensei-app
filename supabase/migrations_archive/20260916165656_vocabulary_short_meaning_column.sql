-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Adds an admin-curated "short_meaning" column to public.vocabulary: a natural, <=3-4 word
-- English gloss for words whose existing primary_meanings entries are all too long to show
-- compactly (see the /admin/short-meanings review page). NULL means no short gloss has been
-- curated yet -- most vocabulary rows will stay NULL indefinitely, this is an exception list,
-- not a replacement for primary_meanings.
--
-- Same enforcement pattern as the other admin-editable vocabulary column
-- (jmdict_match_reviewed, see 20261117_jmdict_entries_admin_update_policy.sql) -- column-scoped
-- grant, relying on that migration's existing "Admins can update vocabulary
-- jmdict_match_reviewed" RLS policy for the row-level is_admin() check (RLS policies aren't
-- column-scoped, so it already covers any UPDATE on this table).

alter table public.vocabulary add column short_meaning text;

comment on column public.vocabulary.short_meaning is 'Admin-curated short (<=3-4 word) natural English gloss, used where primary_meanings entries are all too long to show compactly. NULL until curated. Edited from /admin/short-meanings.';

grant update (short_meaning) on public.vocabulary to authenticated;
