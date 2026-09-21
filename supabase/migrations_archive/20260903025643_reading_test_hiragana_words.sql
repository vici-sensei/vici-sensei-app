-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Replaces the hiragana reading test's content: the 42-sentence story (public.reading_test_sentences,
-- test_type = 'hiragana') is swapped for a 71-word list -- single words/short phrases instead of
-- full sentences, per user request (word-based test now; sentence-based tests may come later under
-- a different test_type, so this table's shape is untouched). Deleting the old rows cascades to
-- user_reading_test_progress (sentence_id references reading_test_sentences(id) on delete cascade),
-- so every user's progress on this test resets -- anyone who already has study_katakana = true stays
-- unlocked (nothing re-locks it retroactively), but revisiting /study/test/hiragana starts the new
-- test from scratch.
--
-- particle_furiganas is set only for sort_order 2 (きをつけて) -- を there is the grammatical
-- object particle, read "o" not "wo" as a bare kana, same convention as the sentences this replaces
-- (20260914_reading_test_particle_hints.sql). Every other word's は/を occurrence is word-internal
-- (おはようございます, へや, はっぴゃく, はっきり) and stays unhinted, same rule as before.

delete from public.reading_test_sentences where test_type = 'hiragana';
alter table public.reading_test_sentences alter column id restart with 1;

insert into public.reading_test_sentences (sort_order, hiragana, romaji, english, test_type) values
(1, 'おはようございます', 'ohayou gozaimasu', 'good morning', 'hiragana'),
(2, 'きをつけて', 'ki o tsukete', 'take care / be careful', 'hiragana'),
(3, 'やまのぼり', 'yama nobori', 'mountain climbing', 'hiragana'),
(4, 'ひやけどめ', 'hiyakedome', 'sunscreen', 'hiragana'),
(5, 'ふくろ', 'fukuro', 'bag', 'hiragana'),
(6, 'へや', 'heya', 'room', 'hiragana'),
(7, 'もえるごみ', 'moeru gomi', 'burnable trash', 'hiragana'),
(8, 'でんきだい', 'denkidai', 'electricity bill', 'hiragana'),
(9, 'れいぞうこ', 'reizouko', 'refrigerator', 'hiragana'),
(10, 'みずぎ', 'mizugi', 'swimsuit', 'hiragana'),
(11, 'かぜ', 'kaze', 'wind / cold', 'hiragana'),
(12, 'ばしょ', 'basho', 'place', 'hiragana'),
(13, 'ぶた', 'buta', 'pig', 'hiragana'),
(14, 'ゆき', 'yuki', 'snow', 'hiragana'),
(15, 'たべられる', 'taberareru', 'can eat (potential form)', 'hiragana'),
(16, 'きゃく', 'kyaku', 'customer / guest', 'hiragana'),
(17, 'きょうきゅう', 'kyoukyuu', 'supply', 'hiragana'),
(18, 'しゃしん', 'shashin', 'photo', 'hiragana'),
(19, 'しゅっしょう', 'shusshou', 'birth', 'hiragana'),
(20, 'おちゃ', 'ocha', 'tea', 'hiragana'),
(21, 'ちゅうちょ', 'chuucho', 'hesitation', 'hiragana'),
(22, 'にゃんこ', 'nyanko', 'kitty', 'hiragana'),
(23, 'にゅうがく', 'nyuugaku', 'school enrollment', 'hiragana'),
(24, 'にょきにょき', 'nyoki nyoki', '(onomatopoeia) sprouting up', 'hiragana'),
(25, 'ひゃく', 'hyaku', 'hundred', 'hiragana'),
(26, 'ひゅうひゅう', 'hyuu hyuu', '(onomatopoeia) whistling wind', 'hiragana'),
(27, 'ひょう', 'hyou', 'hail', 'hiragana'),
(28, 'みゃく', 'myaku', 'pulse', 'hiragana'),
(29, 'こみゅにけーしょん', 'komyunikeeshon', 'communication', 'hiragana'),
(30, 'みょうじ', 'myouji', 'surname', 'hiragana'),
(31, 'りゃくご', 'ryakugo', 'abbreviation', 'hiragana'),
(32, 'りゅうがく', 'ryuugaku', 'studying abroad', 'hiragana'),
(33, 'りょこう', 'ryokou', 'travel', 'hiragana'),
(34, 'ぎゃく', 'gyaku', 'opposite', 'hiragana'),
(35, 'ぎゅうにゅう', 'gyuunyuu', 'milk', 'hiragana'),
(36, 'ぎょうざ', 'gyouza', 'dumplings', 'hiragana'),
(37, 'じゃんけん', 'janken', 'rock-paper-scissors', 'hiragana'),
(38, 'じゅんじょ', 'junjo', 'order / sequence', 'hiragana'),
(39, 'さんびゃく', 'sanbyaku', 'three hundred', 'hiragana'),
(40, 'びゅうびゅう', 'byuu byuu', '(onomatopoeia) strong wind', 'hiragana'),
(41, 'びょういん', 'byouin', 'hospital', 'hiragana'),
(42, 'はっぴゃく', 'happyaku', 'eight hundred', 'hiragana'),
(43, 'ぴゅうぴゅう', 'pyuu pyuu', '(onomatopoeia) whistling', 'hiragana'),
(44, 'ぴょんぴょん', 'pyon pyon', '(onomatopoeia) hopping', 'hiragana'),
(45, 'がっかり', 'gakkari', 'disappointed', 'hiragana'),
(46, 'はっきり', 'hakkiri', 'clearly', 'hiragana'),
(47, 'びっくり', 'bikkuri', 'surprised', 'hiragana'),
(48, 'せっけん', 'sekken', 'soap', 'hiragana'),
(49, 'がっこう', 'gakkou', 'school', 'hiragana'),
(50, 'あっさり', 'assari', 'plainly / lightly', 'hiragana'),
(51, 'けっしん', 'kesshin', 'determination', 'hiragana'),
(52, 'ぐっすり', 'gussuri', 'soundly (sleep)', 'hiragana'),
(53, 'せっせと', 'sesseto', 'diligently', 'hiragana'),
(54, 'げっそり', 'gessori', 'haggard / drained', 'hiragana'),
(55, 'わかった', 'wakatta', 'understood / got it', 'hiragana'),
(56, 'あっち', 'acchi', 'over there', 'hiragana'),
(57, 'むっつ', 'muttsu', 'six (things)', 'hiragana'),
(58, 'とって', 'totte', 'handle', 'hiragana'),
(59, 'ちょっと', 'chotto', 'a little', 'hiragana'),
(60, 'いっぱい', 'ippai', 'full / a lot', 'hiragana'),
(61, 'こっぴどく', 'koppidoku', 'severely', 'hiragana'),
(62, 'きっぷ', 'kippu', 'ticket', 'hiragana'),
(63, 'けっぺき', 'keppeki', 'fastidious / germophobic', 'hiragana'),
(64, 'しっぽ', 'shippo', 'tail', 'hiragana'),
(65, 'みんな', 'minna', 'everyone', 'hiragana'),
(66, 'ほんにん', 'honnin', 'the person themselves', 'hiragana'),
(67, 'かんぬき', 'kannuki', 'door bolt / latch', 'hiragana'),
(68, 'きんねん', 'kinnen', 'recent years', 'hiragana'),
(69, 'てんのう', 'tennou', 'Emperor of Japan', 'hiragana'),
(70, 'つづく', 'tsuzuku', 'continues', 'hiragana'),
(71, 'ちぢむ', 'chijimu', 'shrinks', 'hiragana');

update public.reading_test_sentences
set particle_furiganas = ARRAY[NULL, 'o', NULL, NULL, NULL]::text[]
where test_type = 'hiragana' and sort_order = 2;
