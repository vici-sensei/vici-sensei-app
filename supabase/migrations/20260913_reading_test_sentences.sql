-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Backs the standalone /study/test page: a fixed hiragana reading-comprehension text (not
-- SRS content, not per-user, no relation to hiragana mastery/progress -- the page just renders
-- every row in order). Content lives in the DB rather than a hardcoded array so it can be
-- edited without a redeploy, per user request.
--
-- The 42 sentences form one continuous story that uses, between them, every character/combo in
-- public.hiragana: all 71 seion/dakuten/handakuten characters, all 33 yoon combinations, all 20
-- sokuon combinations, and all 5 n_gemination combinations -- verified programmatically before
-- writing this migration (character-by-character legality + full-coverage check), not just by
-- eye. romaji uses contextual particle readings (wa/o/e for は/を/へ) throughout, matching
-- 20260912_particle_reading_rule.sql's rule.

create table public.reading_test_sentences (
  id int8 generated always as identity primary key,
  sort_order int4 not null unique,
  hiragana text not null,
  romaji text not null,
  english text not null
);
alter table public.reading_test_sentences enable row level security;

create policy "Authenticated users can read reading_test_sentences" on public.reading_test_sentences
  as permissive
  for select
  to authenticated
  using (true);

insert into public.reading_test_sentences (sort_order, hiragana, romaji, english) values
(1, 'きょうは、あさになると、そらがあかるくなる。', 'Kyou wa, asa ni naru to, sora ga akaruku naru.', 'Today, when morning comes, the sky grows bright.'),
(2, 'かぜがぴゅうとやさしくふく。', 'Kaze ga pyuu to yasashiku fuku.', 'The wind blows gently with a soft whistle.'),
(3, 'とりがうたい、ちょうちょがとぶ。', 'Tori ga utai, chouchou ga tobu.', 'Birds sing, and butterflies fly.'),
(4, 'はなばたけで、たんぽぽがあざやかにさく。', 'Hanabatake de, tanpopo ga azayaka ni saku.', 'In the flower field, dandelions bloom vividly.'),
(5, 'いぬがくさのうえをいっきにはしる。', 'Inu ga kusa no ue o ikki ni hashiru.', 'A dog dashes across the grass all at once.'),
(6, 'うさぎがひょっこりあらわれて、ぴょんぴょんとはねてから、ぴゃっとにげる。', 'Usagi ga hyokkori arawarete, pyonpyon to hanete kara, pyatto nigeru.', 'A rabbit suddenly appears, hops boing-boing, then darts away in a flash.'),
(7, 'へびがにょろにょろうごく。', 'Hebi ga nyoronyoro ugoku.', 'A snake moves along, slithering.'),
(8, 'ひよこがぴっぴとなく。', 'Hiyoko ga pippi to naku.', 'A chick cheeps "pi-pi."'),
(9, 'かえるがとびだして、びっくりしてぎゃあとさけぶ。', 'Kaeru ga tobidashite, bikkuri shite gyaa to sakebu.', 'A frog jumps out, and, startled, someone cries "gyaa!"'),
(10, 'そのとき、きゃくがきて、「こんにちは」という。', 'Sono toki, kyaku ga kite, "konnichiwa" to iu.', 'Just then, a guest arrives and says "hello."'),
(11, 'むねのみゃくが、すこしはやくなる。', 'Mune no myaku ga, sukoshi hayaku naru.', 'The pulse in my chest quickens a little.'),
(12, 'みんなでにわをあるいて、はなをそっととって、かびんにかざる。', 'Minna de niwa o aruite, hana o sotto totte, kabin ni kazaru.', 'Everyone walks through the garden, gently picks a flower, and puts it in a vase.'),
(13, 'かわで、さかながおよぎ、すっぽんもいる。いずみのみずが、びゃっとふきだす。', 'Kawa de, sakana ga oyogi, suppon mo iru. Izumi no mizu ga, byatto fukidasu.', 'In the river a fish swims, and there''s a softshell turtle too. A spring''s water suddenly gushes out.'),
(14, '「もうたびにしゅっぱつしよう」と、ちちがいう。', '"Mou tabi ni shuppatsu shiyou" to, chichi ga iu.', '"Let''s set off on our trip now," Father says.'),
(15, 'きっぷをかって、でんしゃにのる。', 'Kippu o katte, densha ni noru.', 'They buy tickets and board the train.'),
(16, 'でんしゃのなかで、いっしょにうたをうたい、みんなじょうずだった。', 'Densha no naka de, issho ni uta o utai, minna jouzu datta.', 'On the train they sing a song together, and everyone was good at it.'),
(17, 'まどのそとで、きゅうにかぜがつよくなり、ひゅうとふく。', 'Mado no soto de, kyuu ni kaze ga tsuyoku nari, hyuu to fuku.', 'Outside the window, the wind suddenly grows strong and whooshes.'),
(18, 'たいようがぽかぽかとてらし、そらはまっさおだった。', 'Taiyou ga pokapoka to terashi, sora wa massao datta.', 'The sun shines warmly, and the sky was deep blue.'),
(19, 'くもがぷかぷかとうかぶ。', 'Kumo ga pukapuka to ukabu.', 'Clouds drift lightly by.'),
(20, 'たんぼのうえに、とんぼがとぶ。', 'Tanbo no ue ni, tonbo ga tobu.', 'A dragonfly flies above the rice paddy.'),
(21, 'いえにつくと、ぎょうざと、ごはんと、りょうりをつくる。', 'Ie ni tsuku to, gyouza to, gohan to, ryouri o tsukuru.', 'On arriving home, they make dumplings, rice, and other dishes.'),
(22, 'こっぺぱんも、しょくたくにならべる。', 'Koppepan mo, shokutaku ni naraberu.', 'They also set bread rolls on the table.'),
(23, 'おちゃをいれて、むちゅうになっておしゃべりする。', 'Ocha o irete, muchuu ni natte oshaberi suru.', 'They pour tea and chat, completely absorbed in conversation.'),
(24, 'ぎゅうにゅうをのんで、みんな、げんきになる。', 'Gyuunyuu o nonde, minna, genki ni naru.', 'They drink milk, and everyone feels energetic.'),
(25, 'しょくじがおわると、せっせとかたづける。', 'Shokuji ga owaru to, sesseto katazukeru.', 'When the meal ends, they tidy up busily.'),
(26, 'ねこが、にゃあとないてから、こっそりとあるいて、まどべにすわる。', 'Neko ga, nyaa to naite kara, kossori to aruite, madobe ni suwaru.', 'The cat meows "nya," then walks quietly and sits by the window.'),
(27, 'そとは、だんだんひがくれて、そらがまっかにそまる。', 'Soto wa, dandan hi ga kurete, sora ga makka ni somaru.', 'Outside, the day gradually darkens, and the sky turns deep red.'),
(28, 'さむさでてがちぢむ。', 'Samusa de te ga chijimu.', 'Hands curl up from the cold.'),
(29, 'よるは、みょうにしずかだった。', 'Yoru wa, myou ni shizuka datta.', 'The night was strangely quiet.'),
(30, 'ほんのすこし、いちびょうだけ、そらをみあげた。', 'Honno sukoshi, ichibyou dake, sora o miageta.', 'For just a moment, one second, I looked up at the sky.'),
(31, 'すると、みゅうという、ちいさなせいれいがあらわれた。', 'Suruto, myuu to iu, chiisana seirei ga arawareta.', 'Then a small spirit named Myu appeared.'),
(32, 'みゅうのうしろから、りゅうもそらをとんできた。', 'Myuu no ushiro kara, ryuu mo sora o tonde kita.', 'From behind Myu, a dragon came flying across the sky too.'),
(33, 'りゅうは、ほしをつかむ、ふしぎなけんぬきをもっていた。', 'Ryuu wa, hoshi o tsukamu, fushigina kennuki o motte ita.', 'The dragon was holding a mysterious pair of tweezers that catches stars.'),
(34, 'そらにひゃくのほしがひかり、とくにみっつがあかるい。', 'Sora ni hyaku no hoshi ga hikari, tokuni mittsu ga akarui.', 'A hundred stars shine in the sky, and three of them are especially bright.'),
(35, '「もうかえりゃいい」と、ちちがわらいながらいう。', '"Mou kaerya ii" to, chichi ga warai nagara iu.', '"We might as well head home now," Father says, laughing.'),
(36, '「じゃあ、かえろう」と、みんなでいえにもどる。', '"Jaa, kaerou" to, minna de ie ni modoru.', '"Alright then, let''s go home" -- and everyone returns home together.'),
(37, 'いちにちじゅう、かぞくとあそんだり、たべたりして、たのしかったっけ。', 'Ichinichi juu, kazoku to asondari, tabetari shite, tanoshikattakke.', 'All day long, playing and eating with the family -- it really was fun, wasn''t it.'),
(38, 'ふとんにはいって、ねんねする。', 'Futon ni haitte, nenne suru.', 'They get into the futon and go to sleepy-time.'),
(39, 'かぜはもう、びゅうびゅうふかず、まったくしずかだ。', 'Kaze wa mou, byuubyuu fukazu, mattaku shizuka da.', 'The wind no longer gusts and howls -- it''s completely still now.'),
(40, 'ゆめのなかで、あっちにもこっちにも、ちょうちょがとんでいた。', 'Yume no naka de, acchi ni mo kocchi ni mo, chouchou ga tonde ita.', 'In the dream, butterflies were flying everywhere, this way and that.'),
(41, 'からだがぐっすりやすまり、こころもしずかになる。', 'Karada ga gussuri yasumari, kokoro mo shizuka ni naru.', 'The body rests soundly, and the heart grows calm too.'),
(42, 'あしたも、みんなでたのしくすごそう。', 'Ashita mo, minna de tanoshiku sugosou.', 'Tomorrow too, let''s all spend the day happily together.');
