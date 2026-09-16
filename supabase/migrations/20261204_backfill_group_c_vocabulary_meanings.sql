-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Fills public.vocabulary.primary_meanings/other_meanings for the remaining 13 rows -- the ones
-- whose meanings only partially overlap the closest jmdict_entries match (jmdict has extra senses,
-- or phrases things slightly differently). Unlike 20261201/20261202, primary_meanings here is
-- vocabulary's own pre-existing `meanings` column verbatim, not a copy of jmdict's primary sense --
-- vocabulary.meanings is trusted as the curated headline meaning for these 13. other_meanings is
-- built from the matched jmdict_entries row's own sense breakdown (its primary_meanings as sense
-- 0, each other_meanings array as the following senses), with every gloss already present in
-- vocabulary.meanings filtered out of its sense, and any sense left empty after that dropped --
-- so the 2D, one-array-per-sense shape from jmdict is preserved, just trimmed of duplicates
-- instead of naively unioning everything into one flat list. None of these 13 are linked via
-- jmdict_entries.vocabulary_ids (same reasoning as 20261202 for the non-exact matches, extended
-- here to every partial match) -- only the display columns are filled.
--
--   vocabulary.id  word         jmdict_entries.id  word/kana_reading
--   7014   ペコペコ      -> 1057    ぺこぺこ
--   10175  就いて        -> 895     に就いて/について
--   13231  ピリピリ      -> 1001    ぴりぴり
--   13373  サーバ        -> 4890    サーバー
--   14673  ビクビク      -> 981     びくびく
--   14737  ペラペラ      -> 1061    ぺらぺら
--   14772  ドタバタ      -> 838     どたばた
--   15063  それっぽい    -> 101064  それらしい
--   18932  日本航空      -> 215204  日航/にっこう
--   19555  セン          -> 87497   栓/せん
--   19949  スレーブ      -> 6614    スレイブ
--   20317  ワイワイ      -> 1212    わいわい
--   20389  バリバリ      -> 946     ばりばり
--
-- Several of these jmdict_entries rows had never been linked to anything before (same root cause
-- as in 20261201/20261202), so their own primary_meanings/other_meanings were never computed from
-- senses. Re-fires sync_jmdict_entries_primary_other_meanings() for all 13 first (a harmless
-- no-op for the two -- 895, 87497 -- already linked elsewhere and already computed).
update public.jmdict_entries
set senses = senses
where id in (1057, 895, 1001, 4890, 981, 1061, 838, 101064, 215204, 87497, 6614, 1212, 946);

with links(vocab_id, entry_id) as (
  values
    (7014, 1057), (10175, 895), (13231, 1001), (13373, 4890), (14673, 981),
    (14737, 1061), (14772, 838), (15063, 101064), (18932, 215204), (19555, 87497),
    (19949, 6614), (20317, 1212), (20389, 946)
),
-- Unifies each matched entry's primary_meanings (as sense 0) and other_meanings' per-sense arrays
-- (as sense 1..n) into one ordered list of jsonb gloss-arrays per vocabulary id.
senses as (
  select l.vocab_id, 0 as sense_ord, to_jsonb(e.primary_meanings) as sense_glosses
  from links l
  join public.jmdict_entries e on e.id = l.entry_id
  union all
  select l.vocab_id, s.ord::int, s.sense
  from links l
  join public.jmdict_entries e on e.id = l.entry_id
  cross join lateral jsonb_array_elements(e.other_meanings) with ordinality as s(sense, ord)
),
-- Drops every gloss already present in vocabulary.meanings from its sense.
filtered as (
  select
    s.vocab_id,
    s.sense_ord,
    coalesce((
      select jsonb_agg(g)
      from jsonb_array_elements_text(s.sense_glosses) g
      where not (g = any(v.meanings))
    ), '[]'::jsonb) as remaining
  from senses s
  join public.vocabulary v on v.id = s.vocab_id
),
-- Drops senses left empty by the filter above, keeps the rest in original sense order.
combined as (
  select vocab_id, coalesce(jsonb_agg(remaining order by sense_ord) filter (where jsonb_array_length(remaining) > 0), '[]'::jsonb) as other_meanings
  from filtered
  group by vocab_id
)
update public.vocabulary v
set
  primary_meanings = v.meanings,
  other_meanings = c.other_meanings
from combined c
where v.id = c.vocab_id;
