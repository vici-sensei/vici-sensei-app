-- Drops the "Particle Reading (は / へ)" rows (id 166-171: particle_ha + particle_he, rule +
-- examples each) and the "Historical & Rare" rows (id 172-178: obsolete わ-row ゐ/ゑ/ゔ plus the
-- iteration-mark rule+example pairs) from public.hiragana -- no longer wanted per user request.
-- These are the entirety of hiragana's kana_type='particle_reading' and kana_type='historical'
-- rows.
--
-- Katakana's own "Historical & Rare" data (ヰ/ヱ, iteration marks) is untouched -- separate table,
-- separate rows -- and BrowseKanaListPage.tsx already hides that whole block per-page whenever
-- hasHistorical is false, so no code change is needed to drop it from /browse/hiragana. Katakana
-- never had a particle_reading section to begin with (verified before writing this), so removing
-- that SOUND_RULE_SECTIONS entry in the same commit as this migration is safe.
--
-- Remaining rows' sort_order is renumbered to stay contiguous (1..146), preserving relative
-- order, then the table is re-clustered so physical storage matches again (same approach as the
-- prior kana-ordering migrations).

delete from public.hiragana where id between 166 and 178;

with ranked as (
  select id, row_number() over (order by sort_order) as new_sort_order
  from public.hiragana
)
update public.hiragana t
set sort_order = ranked.new_sort_order + 100000
from ranked
where ranked.id = t.id;

update public.hiragana
set sort_order = sort_order - 100000;

cluster public.hiragana using hiragana_sort_order_key;
