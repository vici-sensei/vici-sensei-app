-- Drops the Chōonpu (long-vowel mark) rule + example rows from public.hiragana (ids 126-133:
-- the choonpu_rule row plus its 7 choonpu_example rows) -- no longer wanted per user request.
-- Browse (BrowseKanaListPage.tsx) doesn't need a code change for this: RuleSubsection already
-- returns null when a section's row count is 0, so the "Chōonpu" subsection under "Sound Rules &
-- Combinations" disappears from /browse/hiragana on its own once the rows are gone. Katakana's own
-- Chōonpu section is untouched (separate table, separate data) -- SOUND_RULE_SECTIONS is shared
-- between both pages, so removing that entry from code would have wrongly dropped it from
-- /browse/katakana too.
--
-- Remaining rows' sort_order is renumbered to stay contiguous (1..172), preserving relative
-- order, then the table is re-clustered so physical storage matches again (same approach as
-- 20260828_fix_kana_rule_card_ordering.sql).

delete from public.hiragana where id between 126 and 133;

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
