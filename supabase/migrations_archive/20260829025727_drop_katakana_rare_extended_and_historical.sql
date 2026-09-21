-- Two deletions from public.katakana per user request:
--  1. Every "Extended Katakana" row tagged rare/very_rare (id 156-170: ツァ/ツィ/ツェ/ツォ, デュ,
--     フュ, イェ, クァ/グァ, クィ/クェ/クォ, テュ, ヴュ/ヴョ) -- only the 19 "core"-tier extended
--     combinations remain.
--  2. The entire "Historical & Rare" section (id 184-188: ヰ/ヱ, plus the iteration-mark rule +
--     example rows) -- katakana's own historical section, now dropped the same way hiragana's was
--     in 20260829_drop_hiragana_particle_and_historical.sql.
-- Verified zero references in user_katakana_progress/review_logs for all 20 ids before writing
-- this, so no SRS history is lost.
--
-- Remaining rows' sort_order renumbered to stay contiguous, then re-clustered (same approach as
-- the prior kana-ordering migrations).

delete from public.katakana where id in (156, 157, 158, 159, 160, 161, 162, 163, 164, 165, 166, 167, 168, 169, 170, 184, 185, 186, 187, 188);

with ranked as (
  select id, row_number() over (order by sort_order) as new_sort_order
  from public.katakana
)
update public.katakana t
set sort_order = ranked.new_sort_order + 100000
from ranked
where ranked.id = t.id;

update public.katakana
set sort_order = sort_order - 100000;

cluster public.katakana using katakana_sort_order_key;
