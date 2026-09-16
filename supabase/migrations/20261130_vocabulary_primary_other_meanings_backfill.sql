-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Backfill (data-only, no DDL -- see 20261130_vocabulary_primary_other_meanings.sql for the
-- column additions) for public.vocabulary.primary_meanings/other_meanings, copied from every
-- public.jmdict_entries row with a non-null, non-empty vocabulary_ids.
--
-- 5 vocabulary ids (e.g. 2827, スイッチ) are each claimed by two separate jmdict_entries rows --
-- two distinct JMdict senses sharing one reading (see
-- 20261122_jmdict_entries_allow_shared_vocabulary_ids.sql). For those, this concatenates both
-- rows' primary_meanings and other_meanings (ordered by jmdict_entries.id) rather than picking
-- one arbitrarily or dropping either -- no gloss text is lost. Every other vocabulary row copies
-- straight from its single linked jmdict_entries row. Vocabulary rows with no linked
-- jmdict_entries row at all (30 of 17349) are left untouched -- both columns stay NULL, per
-- their column default.
--
-- This same combine logic is reused going forward by the application-level sync in
-- updateJmdictEntrySenses (lib/data/jmdictSenses.ts), which runs it for a single vocabulary id at
-- a time whenever an admin edits senses on /admin/jmdict-senses. Re-run this statement wholesale
-- if jmdict_entries.vocabulary_ids is ever changed outside that flow (see the column comments in
-- 20261130_vocabulary_primary_other_meanings.sql).
with expanded as (
  select e.id as entry_id, v as vocab_id, e.primary_meanings, e.other_meanings
  from public.jmdict_entries e, unnest(e.vocabulary_ids) as v
  where e.vocabulary_ids is not null and cardinality(e.vocabulary_ids) > 0
),
primary_combined as (
  select x.vocab_id, array_agg(p.pm order by x.entry_id, p.pm_ord) as primary_meanings
  from expanded x
  cross join lateral unnest(x.primary_meanings) with ordinality as p(pm, pm_ord)
  group by x.vocab_id
),
other_combined as (
  select x.vocab_id, jsonb_agg(o.om order by x.entry_id, o.om_ord) as other_meanings
  from expanded x
  cross join lateral jsonb_array_elements(x.other_meanings) with ordinality as o(om, om_ord)
  group by x.vocab_id
),
target as (
  select distinct vocab_id from expanded
)
update public.vocabulary vo
set
  primary_meanings = pc.primary_meanings,
  other_meanings = coalesce(oc.other_meanings, '[]'::jsonb)
from target t
left join primary_combined pc on pc.vocab_id = t.vocab_id
left join other_combined oc on oc.vocab_id = t.vocab_id
where vo.id = t.vocab_id;
