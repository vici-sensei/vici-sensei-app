-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Backfill (data-only, no DDL -- see 20261123_jmdict_entries_primary_other_meanings.sql for
-- the column additions) for public.jmdict_entries.primary_meanings / other_meanings, scoped
-- to rows linked to public.vocabulary (vocabulary_ids populated -- the curated subset
-- actually surfaced in the app).
--
-- Repopulates primary_meanings / other_meanings for every jmdict_entries row linked to
-- public.vocabulary, using JMdict's own first-sense ordering by default (backed by manual
-- review of 110 multi-sense entries -- correct ~95%+ of the time), with a small set of
-- explicit overrides for the entries where that default was judged unlikely to be the most
-- commonly used meaning. other_meanings groups by sense (one array element per remaining
-- sense, glosses within a sense joined together) rather than flattening every individual
-- gloss, so the per-sense grouping from `senses` survives into this column too. No gloss
-- text is dropped -- every sense ends up in exactly one of the two columns (verified: for
-- every affected row, 1 + cardinality(other_meanings) = jsonb_array_length(senses)).
--
-- A further ~12 entries were manually reviewed and left at the JMdict default despite
-- initially looking uncertain (e.g. 刻, 直, 掛かる, 筋, ちんちん, でも, どうも, ソフト,
-- マスター, 手元, 折り返し, 大変) -- see project notes for the reasoning per entry. Both
-- the 9 overrides below and those 12 are worth a human double-check.
with overrides(entry_id, p_idx, why) as (
  values
    (23758, 2, '見世物 -- modern general "exhibition/spectacle" sense over the narrower historical Edo-period sideshow term'),
    (69725, 2, '踏み絵 -- modern figurative "loyalty test" usage over the narrow historical artifact meaning'),
    (26823, 6, '差す -- "to hold up an umbrella" is a very common everyday action verb usage'),
    (3784,  2, 'キロ -- standalone use overwhelmingly means kilogram/kilometre, not the bound prefix "kilo-"'),
    (10946, 2, 'ホモ -- the colloquial noun usage is far more common in everyday speech than the technical "homo-" prefix'),
    (12317, 4, 'ラウンド -- "a round" (sports/negotiation) is far more common standalone than "round-shaped"'),
    (16427, 4, '乙 -- "otsu" (thanks for the effort) is now a very mainstream colloquial usage'),
    (54930, 2, '余り -- the negative-pairing adverb ("not very") is learned and used earlier/more often than the noun "remainder"'),
    (2863,  3, 'オーバー -- "exaggerated/over the top" is the dominant modern colloquial usage vs. the dated "overcoat"')
),
target as (
  select e.id, e.senses, coalesce(o.p_idx, 1) as p_idx
  from public.jmdict_entries e
  left join overrides o on o.entry_id = e.id
  where e.vocabulary_ids is not null
    and cardinality(e.vocabulary_ids) > 0
)
update public.jmdict_entries e
set
  primary_meanings = (
    select string_agg(g->>'text', ', ')
    from jsonb_array_elements(t.senses->(t.p_idx - 1)->'gloss') g
  ),
  other_meanings = (
    select coalesce(array_agg(
      (select string_agg(g->>'text', ', ') from jsonb_array_elements(sense->'gloss') g)
      order by ord
    ), '{}')
    from jsonb_array_elements(t.senses) with ordinality as s(sense, ord)
    where ord <> t.p_idx
  )
from target t
where e.id = t.id;
