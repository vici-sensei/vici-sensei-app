-- Drops ヲ (id 45, the katakana wa-row wo character -- effectively unused in modern katakana text,
-- since the direct-object particle is always written in hiragana を) along with the two artificial
-- Chōonpu examples built from it and from ン: ヲー (id 235) and ンー (id 236, a moraic nasal +
-- chōonpu, which doesn't occur in real Japanese either). All per user request; verified zero
-- references in user_katakana_progress/review_logs for id 45 before writing this, so no SRS
-- history is lost.
--
-- Note: GOJUON_ROW_LAYOUT in lib/srs/gojuon.ts documents the wa row as 2 characters "identical for
-- hiragana and katakana" for Browse's loading skeleton -- that's now only true for hiragana (which
-- still has わ/を). Left as-is: it's a same-page loading-skeleton placeholder count, self-corrects
-- the instant real data arrives, and fixing it would mean giving the shared skeleton per-table
-- layouts, out of scope for this cleanup.
--
-- Remaining rows' sort_order renumbered to stay contiguous, then re-clustered (same approach as
-- the prior kana-ordering migrations).

delete from public.katakana where id in (45, 235, 236);

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
