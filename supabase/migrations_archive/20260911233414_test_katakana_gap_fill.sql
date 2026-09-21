-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Appends 13 rows to public.test (test_type = 'katakana', continuing sort_order from 113) to close
-- the character-coverage gap left by 20261102_test_katakana_words_v2.sql. 12 of these are real (if
-- niche/slangy) words recovered from the previous 100-word list (20260919_test_katakana_words.sql)
-- that already solved these rare combos; ヅ is kept as a bare placeholder with an empty english,
-- same convention as みゅ in the hiragana test (20261101_test_hiragana_words_v2.sql) -- no standard
-- katakana word contains ヅ, loanwords use ズ for that sound universally.
--
-- particle_furiganas left null (same reasoning as the parent migration).

insert into public.test (sort_order, question, romaji, english, test_type) values
(114, 'チヂミ', 'chijimi', 'chijimi (Korean pancake)', 'katakana'),
(115, 'ビャクダン', 'byakudan', 'sandalwood', 'katakana'),
(116, 'ヒョッコリ', 'hyokkori', 'suddenly / unexpectedly (onomatopoeia)', 'katakana'),
(117, 'ミョウバン', 'myouban', 'alum', 'katakana'),
(118, 'リャマ', 'ryama', 'llama', 'katakana'),
(119, 'リョウ', 'ryou', 'Ryo (name)', 'katakana'),
(120, 'ハッブル', 'habburu', 'Hubble', 'katakana'),
(121, 'ビョーキ', 'byouki', 'sick (slang)', 'katakana'),
(122, 'トゥクトゥク', 'tukutuku', 'tuk-tuk', 'katakana'),
(123, 'ヒャッホー', 'hyahhoo', 'yahoo! (exclamation of joy)', 'katakana'),
(124, 'ピャー', 'pyaa', 'eek! (surprise sound effect)', 'katakana'),
(125, 'ヴードゥー', 'vuuduu', 'voodoo', 'katakana'),
(126, 'ヅ', 'zu', '', 'katakana');
