-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Reworks the 13 rows added by 20261103_test_katakana_gap_fill.sql (sort_order 114-126): per user
-- request, these 14 rare combinations aren't real vocabulary words worth teaching as such -- they're
-- included in the reading test purely so every katakana combo gets tested at least once. Swapping
-- the forced/niche words (チヂミ, ビャクダン, ヒョッコリ, ミョウバン, リャマ, リョウ, ハッブル,
-- ビョーキ, トゥクトゥク, ヒャッホー, ピャー, ヴードゥー) for the bare syllable itself, empty
-- english, same placeholder convention as ヅ here and みゅ in the hiragana test
-- (20261101_test_hiragana_words_v2.sql). Also adds ピョ, missing from the previous gap-fill.
--
-- romaji values pulled straight from public.katakana.romaji for each character, not guessed.

delete from public.test where test_type = 'katakana' and sort_order between 114 and 126;

insert into public.test (sort_order, question, romaji, english, test_type) values
(114, 'ヂ', 'ji', '', 'katakana'),
(115, 'ヅ', 'zu', '', 'katakana'),
(116, 'ヒャ', 'hya', '', 'katakana'),
(117, 'ヒョ', 'hyo', '', 'katakana'),
(118, 'ミョ', 'myo', '', 'katakana'),
(119, 'リャ', 'rya', '', 'katakana'),
(120, 'リョ', 'ryo', '', 'katakana'),
(121, 'ビャ', 'bya', '', 'katakana'),
(122, 'ビョ', 'byo', '', 'katakana'),
(123, 'ピャ', 'pya', '', 'katakana'),
(124, 'ピョ', 'pyo', '', 'katakana'),
(125, 'トゥ', 'tu', '', 'katakana'),
(126, 'ッブ', 'bbu', '', 'katakana'),
(127, 'ヴ', 'vu', '', 'katakana');
