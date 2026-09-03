-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Mirrors 20260902_reading_test_hiragana_spacing.sql for the new word-based hiragana reading
-- test (20260903_reading_test_hiragana_words.sql): adds a full-width space (U+3000, 　) between
-- hiragana chunks wherever `romaji` already has more than one space-delimited word -- same
-- word-by-word tokenization convention as before, just applied to the 9 multi-chunk entries here
-- (most rows are a single word/mora-group and need no space at all).
--
-- Row 2 (きをつけて, romaji "ki o tsukete") gets 2 spaces, which shifts its particle_furiganas
-- index for を (object particle, read "o") from 1 to 2 in the new 7-character string -- reindexed
-- in the same statement.

update public.reading_test_sentences set hiragana = 'おはよう　ございます' where test_type = 'hiragana' and sort_order = 1;
update public.reading_test_sentences set hiragana = 'き　を　つけて' where test_type = 'hiragana' and sort_order = 2;
update public.reading_test_sentences set hiragana = 'やま　のぼり' where test_type = 'hiragana' and sort_order = 3;
update public.reading_test_sentences set hiragana = 'もえる　ごみ' where test_type = 'hiragana' and sort_order = 7;
update public.reading_test_sentences set hiragana = 'にょき　にょき' where test_type = 'hiragana' and sort_order = 24;
update public.reading_test_sentences set hiragana = 'ひゅう　ひゅう' where test_type = 'hiragana' and sort_order = 26;
update public.reading_test_sentences set hiragana = 'びゅう　びゅう' where test_type = 'hiragana' and sort_order = 40;
update public.reading_test_sentences set hiragana = 'ぴゅう　ぴゅう' where test_type = 'hiragana' and sort_order = 43;
update public.reading_test_sentences set hiragana = 'ぴょん　ぴょん' where test_type = 'hiragana' and sort_order = 44;

update public.reading_test_sentences
set particle_furiganas = ARRAY[NULL, NULL, 'o', NULL, NULL, NULL, NULL]::text[]
where test_type = 'hiragana' and sort_order = 2;
