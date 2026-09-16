-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Fills public.vocabulary.primary_meanings for the 6 rows with no jmdict_entries match at all
-- (checked directly against jmdict_entries.meanings, not just word/kana_reading -- see project
-- notes for the full comparison across all 30 originally-NULL rows): デイリーニュース (15564),
-- ノーベル (15637), ニコラス (15638), 二見 (15791), グリニッジ (18889), シーレン (19190).
--
-- Since there's nothing to copy from jmdict_entries, primary_meanings is set from vocabulary's
-- own pre-existing meanings column instead. other_meanings is left untouched (NULL) -- it still
-- means "no linked jmdict_entries row", which remains true for these 6.
update public.vocabulary
set primary_meanings = meanings
where id in (15564, 15637, 15638, 15791, 18889, 19190);
