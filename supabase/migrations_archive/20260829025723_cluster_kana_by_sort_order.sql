-- Physically reorders public.hiragana/public.katakana rows to match sort_order, so the raw
-- table storage order (e.g. Supabase Studio's default table view, or a SELECT with no ORDER BY)
-- matches the order Browse renders (fetchAllHiragana/fetchAllKatakana order by sort_order, see
-- lib/data/kana.ts). Rows had drifted out of physical order from out-of-order inserts across the
-- kana_orthography_rules migrations. CLUSTER rewrites the heap according to the existing unique
-- sort_order index without changing ids or any other data.
CLUSTER public.hiragana USING hiragana_sort_order_key;
CLUSTER public.katakana USING katakana_sort_order_key;
