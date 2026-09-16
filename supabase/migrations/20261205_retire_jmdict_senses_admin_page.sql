-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Retires the sense-review admin page (app/(shell)/admin/jmdict-senses/page.tsx, the Sensuri
-- JMdict tile on /admin, lib/client-data/jmdictSenses.ts, lib/data/jmdictSenses.ts, and the
-- JmdictSense/JmdictSenseGloss/JmdictSenseReviewRow types) -- all deleted from the app in this
-- same change. Same retirement pattern as 20261121_jmdict_entries_vocabulary_ids_array.sql for
-- the review page before this one: drop the UPDATE policy that let the browser client write the
-- column this page edited, since nothing in the app writes jmdict_entries.senses through RLS
-- anymore (scripts/import-jmdict.mjs writes it too, but via `supabase db query --linked` with an
-- elevated role, which this grant/policy never gated).
--
-- Everything else this page depended on stays: the senses column itself, the
-- sync_jmdict_entries_primary_other_meanings() trigger, and public.vocabulary's
-- primary_meanings/other_meanings columns are all still real, independently-populated data (see
-- 20261130_vocabulary_primary_other_meanings.sql onward), not specific to this admin page.

drop policy "Admins can update jmdict_entries senses" on public.jmdict_entries;
revoke update (senses) on public.jmdict_entries from authenticated;
