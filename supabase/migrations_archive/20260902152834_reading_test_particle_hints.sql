-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Adds particle_furiganas to reading_test_sentences: a text[] parallel to each character of
-- `hiragana` (Array.from(hiragana) client-side), NULL everywhere except は/を/へ occurrences
-- that are actually read as the "wa"/"o"/"e" grammatical particle. Word-internal は/へ
-- (はなばたけ, はしる, はねる, へび, はやく, ごはん, はいる) are deliberately left NULL --
-- generated + verified programmatically against the source text (every hinted index re-checked
-- to actually be は/を/へ and mapped to the right reading before writing this file), not typed
-- by hand. Same column shape/convention as public.vocabulary.furiganas, rendered client-side
-- with the existing lib/study/furigana.tsx renderWordWithFurigana helper -- no new rendering
-- code, same <ruby>/<rt> pattern already used for kanji furigana elsewhere in the app.
--
-- Two judgment calls worth knowing about:
-- 1. こんにちは (sort_order 10) is hinted even though it's a fixed greeting, not a topic
--    particle attached to a preceding noun in this sentence -- it genuinely is pronounced
--    "...chi-wa", so it fits "hint wherever は is actually read wa" literally.
-- 2. へ never occurs as the direction particle anywhere in this text -- its one occurrence
--    (へび, "snake", sort_order 7) is word-internal -- so no row here ever hints "e".

alter table public.reading_test_sentences add column particle_furiganas text[] null;

update public.reading_test_sentences set particle_furiganas = ARRAY[NULL,NULL,NULL,'wa',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL]::text[] where sort_order = 1;
update public.reading_test_sentences set particle_furiganas = ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'o',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL]::text[] where sort_order = 5;
update public.reading_test_sentences set particle_furiganas = ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'wa',NULL,NULL,NULL,NULL,NULL]::text[] where sort_order = 10;
update public.reading_test_sentences set particle_furiganas = ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,'o',NULL,NULL,NULL,NULL,NULL,NULL,NULL,'o',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL]::text[] where sort_order = 12;
update public.reading_test_sentences set particle_furiganas = ARRAY[NULL,NULL,NULL,'o',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL]::text[] where sort_order = 15;
update public.reading_test_sentences set particle_furiganas = ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'o',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL]::text[] where sort_order = 16;
update public.reading_test_sentences set particle_furiganas = ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'wa',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL]::text[] where sort_order = 18;
update public.reading_test_sentences set particle_furiganas = ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'o',NULL,NULL,NULL,NULL]::text[] where sort_order = 21;
update public.reading_test_sentences set particle_furiganas = ARRAY[NULL,NULL,NULL,'o',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL]::text[] where sort_order = 23;
update public.reading_test_sentences set particle_furiganas = ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,'o',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL]::text[] where sort_order = 24;
update public.reading_test_sentences set particle_furiganas = ARRAY[NULL,NULL,'wa',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL]::text[] where sort_order = 27;
update public.reading_test_sentences set particle_furiganas = ARRAY[NULL,NULL,'wa',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL]::text[] where sort_order = 29;
update public.reading_test_sentences set particle_furiganas = ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'o',NULL,NULL,NULL,NULL,NULL]::text[] where sort_order = 30;
update public.reading_test_sentences set particle_furiganas = ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'o',NULL,NULL,NULL,NULL,NULL,NULL]::text[] where sort_order = 32;
update public.reading_test_sentences set particle_furiganas = ARRAY[NULL,NULL,NULL,'wa',NULL,NULL,NULL,'o',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'o',NULL,NULL,NULL,NULL,NULL,NULL]::text[] where sort_order = 33;
update public.reading_test_sentences set particle_furiganas = ARRAY[NULL,NULL,'wa',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL]::text[] where sort_order = 39;
