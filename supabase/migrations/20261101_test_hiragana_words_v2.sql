-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Replaces the hiragana reading test's word list (public.test, test_type = 'hiragana') with a new
-- 78-word set chosen to cover every hiragana/dakuten/handakuten/yoon/sokuon/n-combo character,
-- including the rare ones the previous list didn't hit as directly (ぢ, づ, んぬ, んの, びゃ, ぴゃ,
-- ぴゅ). Deleting the old rows cascades to user_reading_test_progress (sentence_id references
-- test(id) on delete cascade), so hiragana reading-test progress resets -- same tradeoff already
-- accepted in 20260903_reading_test_hiragana_words.sql. Not restarting the id identity this time:
-- public.test now also holds the 100 katakana rows (ids 72-171, see 20260919_test_katakana_words.sql),
-- so the new hiragana rows just take whatever ids the sequence hands out next (>= 172) instead of
-- restarting at 1, which would collide with those.
--
-- みゅ (sort_order 42) has no common native-Japanese word -- it appears almost exclusively in
-- loanwords (ミュージック etc.), so it's kept as a bare syllable with an empty english, same
-- placeholder convention already used for it in this table.
--
-- particle_furiganas is set only for こんにちは (sort_order 22) -- its trailing は is the famous
-- irregular case read "wa" (historically the topic particle), same convention as
-- 20260903_reading_test_hiragana_words.sql's きをつけて. Every other word's は/を/へ is word-internal
-- (はなぢ) and stays unhinted.
--
-- Multi-chunk entries get the U+3000 ideographic-space convention from
-- 20260902_reading_test_hiragana_spacing.sql (one space per romaji word boundary): the four
-- reduplicated onomatopoeia (ひゅうひゅう, びゅうびゅう, ぴゅうぴゅう, ぴょんぴょん).

delete from public.test where test_type = 'hiragana';

insert into public.test (sort_order, question, romaji, english, test_type) values
(1, 'あさ', 'asa', 'morning', 'hiragana'),
(2, 'おおきい', 'ookii', 'big', 'hiragana'),
(3, 'かぜ', 'kaze', 'wind / cold', 'hiragana'),
(4, 'ぞう', 'zou', 'elephant', 'hiragana'),
(5, 'げんき', 'genki', 'energetic / well', 'hiragana'),
(6, 'でんわ', 'denwa', 'telephone', 'hiragana'),
(7, 'こども', 'kodomo', 'child', 'hiragana'),
(8, 'ばん', 'ban', 'evening', 'hiragana'),
(9, 'かぎ', 'kagi', 'key', 'hiragana'),
(10, 'ごはん', 'gohan', '(cooked) rice / meal', 'hiragana'),
(11, 'むし', 'mushi', 'insect', 'hiragana'),
(12, 'め', 'me', 'eye', 'hiragana'),
(13, 'ほん', 'hon', 'book', 'hiragana'),
(14, 'へや', 'heya', 'room', 'hiragana'),
(15, 'ふゆ', 'fuyu', 'winter', 'hiragana'),
(16, 'これ', 'kore', 'this', 'hiragana'),
(17, 'さくら', 'sakura', 'cherry blossom', 'hiragana'),
(18, 'よる', 'yoru', 'night', 'hiragana'),
(19, 'はなぢ', 'hanaji', 'nosebleed', 'hiragana'),
(20, 'つづく', 'tsuzuku', 'to continue', 'hiragana'),
(21, 'こんな', 'konna', 'like this', 'hiragana'),
(22, 'こんにちは', 'konnichiwa', 'hello', 'hiragana'),
(23, 'ざんねん', 'zannen', 'too bad / a pity', 'hiragana'),
(24, 'かんぬし', 'kannushi', 'Shinto shrine priest', 'hiragana'),
(25, 'たんのう', 'tannou', 'to fully enjoy / proficient', 'hiragana'),
(26, 'きゃく', 'kyaku', 'customer / guest', 'hiragana'),
(27, 'きゅう', 'kyuu', 'nine', 'hiragana'),
(28, 'べんきょう', 'benkyou', 'study', 'hiragana'),
(29, 'しゃしん', 'shashin', 'photo', 'hiragana'),
(30, 'しゅくだい', 'shukudai', 'homework', 'hiragana'),
(31, 'しょくじ', 'shokuji', 'meal', 'hiragana'),
(32, 'ちゃいろ', 'chairo', 'brown', 'hiragana'),
(33, 'ちゅうい', 'chuui', 'caution / attention', 'hiragana'),
(34, 'ちょっと', 'chotto', 'a little / hold on', 'hiragana'),
(35, 'にゃんこ', 'nyanko', 'kitty', 'hiragana'),
(36, 'ぎゅうにゅう', 'gyuunyuu', 'milk', 'hiragana'),
(37, 'にょうぼう', 'nyoubou', '(one''s) wife', 'hiragana'),
(38, 'ひゃく', 'hyaku', 'hundred', 'hiragana'),
(39, 'ひゅう　ひゅう', 'hyuu hyuu', '(onomatopoeia) whistling wind', 'hiragana'),
(40, 'ひょう', 'hyou', 'hail', 'hiragana'),
(41, 'みゃく', 'myaku', 'pulse', 'hiragana'),
(42, 'みゅ', 'myu', '', 'hiragana'),
(43, 'みょうが', 'myouga', 'Japanese ginger', 'hiragana'),
(44, 'りゃく', 'ryaku', 'abbreviation', 'hiragana'),
(45, 'りゅう', 'ryuu', 'dragon', 'hiragana'),
(46, 'りょこう', 'ryokou', 'trip / travel', 'hiragana'),
(47, 'ぎゃく', 'gyaku', 'opposite', 'hiragana'),
(48, 'ぎょうざ', 'gyouza', 'dumpling', 'hiragana'),
(49, 'じゃがいも', 'jagaimo', 'potato', 'hiragana'),
(50, 'じゅぎょう', 'jugyou', 'class / lesson', 'hiragana'),
(51, 'じょうず', 'jouzu', 'skillful', 'hiragana'),
(52, 'だいじょうぶ', 'daijoubu', 'it''s okay / fine', 'hiragana'),
(53, 'びゃっこ', 'byakko', 'White Tiger (mythical beast)', 'hiragana'),
(54, 'びゅう　びゅう', 'byuu byuu', '(onomatopoeia) strong wind', 'hiragana'),
(55, 'びょういん', 'byouin', 'hospital', 'hiragana'),
(56, 'ろっぴゃく', 'roppyaku', 'six hundred', 'hiragana'),
(57, 'ぴゅう　ぴゅう', 'pyuu pyuu', '(onomatopoeia) whistling', 'hiragana'),
(58, 'ぴょん　ぴょん', 'pyon pyon', '(onomatopoeia) hopping', 'hiragana'),
(59, 'けっか', 'kekka', 'result', 'hiragana'),
(60, 'さっき', 'sakki', 'a little while ago', 'hiragana'),
(61, 'びっくり', 'bikkuri', 'surprised', 'hiragana'),
(62, 'いっけん', 'ikken', 'at first glance', 'hiragana'),
(63, 'がっこう', 'gakkou', 'school', 'hiragana'),
(64, 'いっさい', 'issai', 'entirely / (not) at all', 'hiragana'),
(65, 'ぐっすり', 'gussuri', 'soundly (sleep)', 'hiragana'),
(66, 'けっせき', 'kesseki', 'absence', 'hiragana'),
(67, 'ひっそり', 'hissori', 'quietly', 'hiragana'),
(68, 'もったいない', 'mottainai', 'wasteful', 'hiragana'),
(69, 'こっち', 'kocchi', 'this way / here', 'hiragana'),
(70, 'みっつ', 'mittsu', 'three (items)', 'hiragana'),
(71, 'まって', 'matte', 'wait!', 'hiragana'),
(72, 'いっぱい', 'ippai', 'full / a lot', 'hiragana'),
(73, 'えんぴつ', 'enpitsu', 'pencil', 'hiragana'),
(74, 'きっぷ', 'kippu', 'ticket', 'hiragana'),
(75, 'いっぴき', 'ippiki', 'one (small animal, counter)', 'hiragana'),
(76, 'いっぺん', 'ippen', 'once', 'hiragana'),
(77, 'しっぽ', 'shippo', 'tail', 'hiragana'),
(78, 'ざっし', 'zasshi', 'magazine', 'hiragana');

update public.test
set particle_furiganas = ARRAY[NULL, NULL, NULL, NULL, 'wa']::text[]
where test_type = 'hiragana' and sort_order = 22;
