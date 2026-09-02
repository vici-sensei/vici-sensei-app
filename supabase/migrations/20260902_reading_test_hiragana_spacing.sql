-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Adds a full-width space (U+3000, 　 -- half-width   barely reads next to full-width kana)
-- before every word in reading_test_sentences.hiragana, including particles (は/を/に/で/と/
-- が/も/から...) -- mirroring exactly how the existing `romaji` column already tokenizes each
-- sentence (each romaji word, comma-attached or not, maps to one hiragana chunk), rather than
-- standard bunsetsu-attached wakachigaki (which fuses a particle to its preceding word).
-- Requested explicitly: beginners find the romaji column's word-by-word spacing easier to
-- read than a particle fused onto its host word, so the hiragana now matches it -- e.g.
-- "Kyou wa, asa ni naru to" -> きょう　は、　あさ　に　なる　と, not きょうは、あさに　なると.
--
-- particle_furiganas (parallel to Array.from(hiragana)) is re-indexed in the same migration
-- to keep the は/を/へ reading hints pointing at the right character -- both this hiragana
-- rewrite and every index shift were generated and verified programmatically (space-stripped
-- text checked to equal the prior hiragana exactly, new indices derived by walking old/new
-- character arrays in lockstep), not typed by hand.
--
-- Also fixes a pre-existing off-by-one in sort_order 12's particle_furiganas (29 elements
-- vs. the row's actual 30-character hiragana) that silently disabled every particle hint on
-- that row, since buildFuriganaSegments requires an exact length match -- see
-- lib/study/furigana.tsx.

update public.reading_test_sentences set hiragana = 'きょう　は、　あさ　に　なる　と、　そら　が　あかるく　なる。' where sort_order = 1;
update public.reading_test_sentences set hiragana = 'かぜ　が　ぴゅう　と　やさしく　ふく。' where sort_order = 2;
update public.reading_test_sentences set hiragana = 'とり　が　うたい、　ちょうちょ　が　とぶ。' where sort_order = 3;
update public.reading_test_sentences set hiragana = 'はなばたけ　で、　たんぽぽ　が　あざやか　に　さく。' where sort_order = 4;
update public.reading_test_sentences set hiragana = 'いぬ　が　くさ　の　うえ　を　いっき　に　はしる。' where sort_order = 5;
update public.reading_test_sentences set hiragana = 'うさぎ　が　ひょっこり　あらわれて、　ぴょんぴょん　と　はねて　から、　ぴゃっと　にげる。' where sort_order = 6;
update public.reading_test_sentences set hiragana = 'へび　が　にょろにょろ　うごく。' where sort_order = 7;
update public.reading_test_sentences set hiragana = 'ひよこ　が　ぴっぴ　と　なく。' where sort_order = 8;
update public.reading_test_sentences set hiragana = 'かえる　が　とびだして、　びっくり　して　ぎゃあ　と　さけぶ。' where sort_order = 9;
update public.reading_test_sentences set hiragana = 'その　とき、　きゃく　が　きて、　「こんにちは」　と　いう。' where sort_order = 10;
update public.reading_test_sentences set hiragana = 'むね　の　みゃく　が、　すこし　はやく　なる。' where sort_order = 11;
update public.reading_test_sentences set hiragana = 'みんな　で　にわ　を　あるいて、　はな　を　そっと　とって、　かびん　に　かざる。' where sort_order = 12;
update public.reading_test_sentences set hiragana = 'かわ　で、　さかな　が　およぎ、　すっぽん　も　いる。　いずみ　の　みず　が、　びゃっと　ふきだす。' where sort_order = 13;
update public.reading_test_sentences set hiragana = '「もう　たび　に　しゅっぱつ　しよう」　と、　ちち　が　いう。' where sort_order = 14;
update public.reading_test_sentences set hiragana = 'きっぷ　を　かって、　でんしゃ　に　のる。' where sort_order = 15;
update public.reading_test_sentences set hiragana = 'でんしゃ　の　なか　で、　いっしょ　に　うた　を　うたい、　みんな　じょうず　だった。' where sort_order = 16;
update public.reading_test_sentences set hiragana = 'まど　の　そと　で、　きゅう　に　かぜ　が　つよく　なり、　ひゅう　と　ふく。' where sort_order = 17;
update public.reading_test_sentences set hiragana = 'たいよう　が　ぽかぽか　と　てらし、　そら　は　まっさお　だった。' where sort_order = 18;
update public.reading_test_sentences set hiragana = 'くも　が　ぷかぷか　と　うかぶ。' where sort_order = 19;
update public.reading_test_sentences set hiragana = 'たんぼ　の　うえ　に、　とんぼ　が　とぶ。' where sort_order = 20;
update public.reading_test_sentences set hiragana = 'いえ　に　つく　と、　ぎょうざ　と、　ごはん　と、　りょうり　を　つくる。' where sort_order = 21;
update public.reading_test_sentences set hiragana = 'こっぺぱん　も、　しょくたく　に　ならべる。' where sort_order = 22;
update public.reading_test_sentences set hiragana = 'おちゃ　を　いれて、　むちゅう　に　なって　おしゃべり　する。' where sort_order = 23;
update public.reading_test_sentences set hiragana = 'ぎゅうにゅう　を　のんで、　みんな、　げんき　に　なる。' where sort_order = 24;
update public.reading_test_sentences set hiragana = 'しょくじ　が　おわる　と、　せっせと　かたづける。' where sort_order = 25;
update public.reading_test_sentences set hiragana = 'ねこ　が、　にゃあ　と　ないて　から、　こっそり　と　あるいて、　まどべ　に　すわる。' where sort_order = 26;
update public.reading_test_sentences set hiragana = 'そと　は、　だんだん　ひ　が　くれて、　そら　が　まっか　に　そまる。' where sort_order = 27;
update public.reading_test_sentences set hiragana = 'さむさ　で　て　が　ちぢむ。' where sort_order = 28;
update public.reading_test_sentences set hiragana = 'よる　は、　みょう　に　しずか　だった。' where sort_order = 29;
update public.reading_test_sentences set hiragana = 'ほんの　すこし、　いちびょう　だけ、　そら　を　みあげた。' where sort_order = 30;
update public.reading_test_sentences set hiragana = 'すると、　みゅう　と　いう、　ちいさな　せいれい　が　あらわれた。' where sort_order = 31;
update public.reading_test_sentences set hiragana = 'みゅう　の　うしろ　から、　りゅう　も　そら　を　とんで　きた。' where sort_order = 32;
update public.reading_test_sentences set hiragana = 'りゅう　は、　ほし　を　つかむ、　ふしぎな　けんぬき　を　もって　いた。' where sort_order = 33;
update public.reading_test_sentences set hiragana = 'そら　に　ひゃく　の　ほし　が　ひかり、　とくに　みっつ　が　あかるい。' where sort_order = 34;
update public.reading_test_sentences set hiragana = '「もう　かえりゃ　いい」　と、　ちち　が　わらい　ながら　いう。' where sort_order = 35;
update public.reading_test_sentences set hiragana = '「じゃあ、　かえろう」　と、　みんな　で　いえ　に　もどる。' where sort_order = 36;
update public.reading_test_sentences set hiragana = 'いちにち　じゅう、　かぞく　と　あそんだり、　たべたり　して、　たのしかったっけ。' where sort_order = 37;
update public.reading_test_sentences set hiragana = 'ふとん　に　はいって、　ねんね　する。' where sort_order = 38;
update public.reading_test_sentences set hiragana = 'かぜ　は　もう、　びゅうびゅう　ふかず、　まったく　しずか　だ。' where sort_order = 39;
update public.reading_test_sentences set hiragana = 'ゆめ　の　なか　で、　あっち　に　も　こっち　に　も、　ちょうちょ　が　とんで　いた。' where sort_order = 40;
update public.reading_test_sentences set hiragana = 'からだ　が　ぐっすり　やすまり、　こころ　も　しずか　に　なる。' where sort_order = 41;
update public.reading_test_sentences set hiragana = 'あした　も、　みんな　で　たのしく　すごそう。' where sort_order = 42;

update public.reading_test_sentences set particle_furiganas = ARRAY[NULL,NULL,NULL,NULL,'wa',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL]::text[] where sort_order = 1;
update public.reading_test_sentences set particle_furiganas = ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'o',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL]::text[] where sort_order = 5;
update public.reading_test_sentences set particle_furiganas = ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'wa',NULL,NULL,NULL,NULL,NULL,NULL,NULL]::text[] where sort_order = 10;
update public.reading_test_sentences set particle_furiganas = ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'o',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'o',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL]::text[] where sort_order = 12;
update public.reading_test_sentences set particle_furiganas = ARRAY[NULL,NULL,NULL,NULL,'o',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL]::text[] where sort_order = 15;
update public.reading_test_sentences set particle_furiganas = ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'o',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL]::text[] where sort_order = 16;
update public.reading_test_sentences set particle_furiganas = ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'wa',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL]::text[] where sort_order = 18;
update public.reading_test_sentences set particle_furiganas = ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'o',NULL,NULL,NULL,NULL,NULL]::text[] where sort_order = 21;
update public.reading_test_sentences set particle_furiganas = ARRAY[NULL,NULL,NULL,NULL,'o',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL]::text[] where sort_order = 23;
update public.reading_test_sentences set particle_furiganas = ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL,'o',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL]::text[] where sort_order = 24;
update public.reading_test_sentences set particle_furiganas = ARRAY[NULL,NULL,NULL,'wa',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL]::text[] where sort_order = 27;
update public.reading_test_sentences set particle_furiganas = ARRAY[NULL,NULL,NULL,'wa',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL]::text[] where sort_order = 29;
update public.reading_test_sentences set particle_furiganas = ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'o',NULL,NULL,NULL,NULL,NULL,NULL]::text[] where sort_order = 30;
update public.reading_test_sentences set particle_furiganas = ARRAY[NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'o',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL]::text[] where sort_order = 32;
update public.reading_test_sentences set particle_furiganas = ARRAY[NULL,NULL,NULL,NULL,'wa',NULL,NULL,NULL,NULL,NULL,'o',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,'o',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL]::text[] where sort_order = 33;
update public.reading_test_sentences set particle_furiganas = ARRAY[NULL,NULL,NULL,'wa',NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL,NULL]::text[] where sort_order = 39;
