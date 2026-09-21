-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Links 9 public.vocabulary rows to their jmdict_entries counterpart. These 9 were part of the 30
-- rows left NULL by 20261130_vocabulary_primary_other_meanings_backfill.sql -- no jmdict_entries
-- row had this exact word/kana_reading, so the original vocabulary_ids linking never picked them
-- up. Manual review (comparing meanings, not just kana_reading) found a jmdict_entries row with
-- the exact same meanings for each, under a slightly different kana spelling:
--
--   vocabulary.id  word            jmdict_entries.id  kana_reading      why it wasn't matched
--   4634   オーバコート    -> 2909    オーバーコート   missing ー
--   4639   タイア          -> 6793    タイヤ            ア vs ヤ
--   6768   カテゴリー      -> 3350    カテゴリ          missing ー
--   7039   バテる          -> 942     ばてる            katakana vs hiragana
--   13363  バイオリニスト  -> 8686    ヴァイオリニスト  バ vs ヴァ
--   14702  ズキズキ        -> 592     ずきずき          katakana vs hiragana
--   15565  デオキシルボ    -> 7340    デオキシリボ      ル vs リ, likely a typo
--   19038  メモリカード    -> 11931   メモリーカード    missing ー
--   20296  刻一刻と        -> 26299   こくいっこく      extra trailing と
--
-- Two of these nine jmdict_entries rows (6793, 26299) already link to a different vocabulary row
-- each (6732 タイヤ, 18322 刻一刻 -- the canonical spelling). This appends the variant alongside
-- it rather than replacing, since jmdict_entries.vocabulary_ids has held more than one vocabulary
-- id per entry since 20261121_jmdict_entries_vocabulary_ids_array.sql (one JMdict sense can
-- correspond to more than one vocabulary spelling).
with links(entry_id, vocab_id) as (
  values
    (2909, 4634), (6793, 4639), (3350, 6768), (942, 7039), (8686, 13363),
    (592, 14702), (7340, 15565), (11931, 19038), (26299, 20296)
)
update public.jmdict_entries e
set vocabulary_ids = case
  when e.vocabulary_ids is null then array[l.vocab_id]
  when l.vocab_id = any(e.vocabulary_ids) then e.vocabulary_ids
  else e.vocabulary_ids || l.vocab_id
end
from links l
where e.id = l.entry_id;

-- 7 of these 9 jmdict_entries rows had no vocabulary_ids before this migration, so they were
-- never touched by the trigger re-fire in 20261125_jmdict_entries_admin_can_edit_senses.sql
-- (which only updated rows that already had vocabulary_ids at the time) -- their
-- primary_meanings/other_meanings are still sitting at the column default from
-- 20261126_jmdict_entries_meanings_as_arrays.sql (NULL / '[]'), never computed from senses.
-- Re-fires sync_jmdict_entries_primary_other_meanings() for exactly the entries linked above (a
-- harmless no-op for the two -- 6793, 26299 -- that already had it computed) so the combine
-- backfill below has real primary_meanings/other_meanings to read.
update public.jmdict_entries
set senses = senses
where id in (2909, 6793, 3350, 942, 8686, 592, 7340, 11931, 26299);

-- Re-runs the same combine logic as 20261130_vocabulary_primary_other_meanings_backfill.sql. This
-- vocabulary_ids change happened outside the /admin/jmdict-senses save flow, so the
-- application-level sync in lib/data/jmdictSenses.ts never ran for it (see the column comments in
-- 20261130_vocabulary_primary_other_meanings.sql for that documented gap) -- without this, the 9
-- rows just linked above would stay NULL despite now being linked. Safe to re-run over every
-- linked row, not just the 9: already-correct rows recompute to the same values.
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
