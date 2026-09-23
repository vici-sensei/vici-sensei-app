-- EU-new + US-new BOTH, identical text (vocabulary/kanji_word/kanji_detail_words reference data are
-- byte-identical on both; the frozen project doesn't get it).
--
-- Fixes vocabulary.furiganas (and romaji_furiganas) where the per-character furigana is wrong, plus
-- the kanji_word.reading_group of the kanji whose reading changes as a result, then rebuilds
-- kanji_detail_words. Reported case: 大急ぎ おおいそぎ was ['おおい','そ',''] (い over 大),
-- correct is ['おお','いそ',''] -- 大 = おお, 急 = いそ(ぐ).
--
-- How the list was built (2026-09-23, read-only against EU-new): all 17349 rows compared with
-- JmdictFurigana 2.3.1+2026-08-25 (github.com/Doublevil/JmdictFurigana) on word + kana_reading --
-- 13977 identical, 160 different, 3110 kana-only, 102 kanji words not in it (reviewed by hand) --
-- plus two checks on every row: the furigana + kana characters must spell kana_reading, and no kana
-- character may carry furigana. The furigana came from jisho.org's alignment (jisho shows the same
-- errors, e.g. 大急ぎ おおい/そ), which cut readings at the kanji table's okurigana dots.
--
-- Only objective errors are changed: a kanji gets a furigana that isn't one of its readings (checked
-- against public.kanji on/kun readings, allowing rendaku/っ), the furigana doesn't spell the word's
-- reading, or a kana character carries furigana. NOT changed, on purpose (convention, not error --
-- JmdictFurigana differs but both forms are defensible): per-character ateji (亜米利加 ア/メ/リ/カ),
-- 天皇 てん/のう (連声), 一人 ひと/り and 上手 じょう/ず (人 -り and 手 ズ are listed readings),
-- and words we group but JmdictFurigana splits (文字 もじ, 海苔 のり, 百合 ゆり, ...).
--
-- kanji_word.reading_group: most wrong rows sat alone in a group made from the wrong reading (大 in
-- 大急ぎ alone in group 4 "おおい" next to group 1 "おお" with 39 words). Each kanji whose reading
-- changes moves to the group that already holds that reading among unchanged words (大急ぎ 大 ->
-- 1); a jukujikun reading gets a group of its own, like 今日/大人 have (shared by 真面目/生真面目);
-- a reading listed on its own in public.kanji (背 せい, 基 もとい, 留 とど.める) gets a new group;
-- a row already alone in its group keeps it, and so does a mere variant of its group's reading
-- that public.kanji doesn't list (先 さっき, 詩歌 しい, 浮気 うわ, 突く つつ) -- a new singleton
-- group would push such a rare word into the kanji's 3 example words (詩歌 over 詩集).
-- No user on EU-new or US-new has kanji-reading or vocabulary progress on any of the 75 words
-- (checked before writing this), so no existing card changes.
--
-- Idempotent and guarded: a row is only touched if word/kana_reading match and its furiganas is
-- either the old or the new value (same for kanji_word: id_kanji/id_word + old or new group);
-- anything else aborts the whole migration.

create temp table _furigana_fix (
  id bigint primary key,
  word text not null,
  kana_reading text not null,
  old_furiganas text[] not null,
  new_furiganas text[] not null,
  new_romaji_furiganas text[] not null
);

insert into _furigana_fix (id, word, kana_reading, old_furiganas, new_furiganas, new_romaji_furiganas) values
-- a) split on the wrong kana boundary -- the reading of the kanji swallowed okurigana of an
--    unrelated kun reading (大 "-おお.いに" -> おおい, 画 "かく.する" -> かくす, 死 "し.に-" -> しに)
  (12081, '大急ぎ', 'おおいそぎ', array['おおい','そ',''], array['おお','いそ',''], array['oo','iso','']),
  (5529, '浮気', 'うわき', array['う','わき'], array['うわ','き'], array['uwa','ki']),
  (8733, '子牛', 'こうし', array['こう','し'], array['こ','うし'], array['ko','ushi']),
  (10402, '黒色', 'くろいろ', array['くろい','ろ'], array['くろ','いろ'], array['kuro','iro']),
  (12025, '死人', 'しにん', array['しに','ん'], array['し','にん'], array['shi','nin']),
  (12792, '青色', 'あおいろ', array['あおい','ろ'], array['あお','いろ'], array['ao','iro']),
  (13811, '赤色', 'あかいろ', array['あかい','ろ'], array['あか','いろ'], array['aka','iro']),
  (18488, '画数', 'かくすう', array['かくす','う'], array['かく','すう'], array['kaku','suu']),
  (8489, '西瓜', 'すいか', array['す','いか'], array['すい','か'], array['sui','ka']),
  (8494, '贔屓', 'ひいき', array['ひ','いき'], array['ひい','き'], array['hii','ki']),
  (14006, '詩歌', 'しいか', array['し','いか'], array['しい','か'], array['shii','ka']),
-- b) furigana doesn't spell the row's own kana_reading (copied from a sibling row of the same word
--    with another reading: 背 せ/せい, 突く つく/つつく, 注ぎ込む そそぎこむ/つぎこむ, ...)
  (1208, '先', 'さっき', array['さき'], array['さっき'], array['sakki']),
  (2523, '其のまま', 'そのまま', array['その','','',''], array['そ','','',''], array['so','','','']),
  (2894, '背', 'せい', array['せ'], array['せい'], array['sei']),
  (4071, '目出度い', 'めでたい', array['め','で','たい',''], array['め','で','た',''], array['me','de','ta','']),
  (6954, '留める', 'とどめる', array['と','',''], array['とど','',''], array['todo','','']),
  (6977, '突く', 'つつく', array['つ',''], array['つつ',''], array['tsutsu','']),
  (7619, '基', 'もとい', array['もと'], array['もとい'], array['motoi']),
  (8996, '己', 'おのれ', array['おれ'], array['おのれ'], array['onore']),
  (13924, '注ぎ込む', 'つぎこむ', array['そそ','','こ',''], array['つ','','こ',''], array['tsu','','ko','']),
  (14631, '埋める', 'うずめる', array['う','',''], array['うず','',''], array['uzu','','']),
  (15722, '鶏', 'にわとり', array['とり'], array['にわとり'], array['niwatori']),
-- c) furigana over a kana character
  (12738, 'やり甲斐', 'やりがい', array['や','','がい','-'], array['','','がい','-'], array['','','gai','-']),
  (12691, 'カ国', 'かこく', array['か','こく'], array['','こく'], array['','koku']),
  (20330, 'いい', 'いい', array['い','い'], array['',''], array['','']),
-- d) a whole-word (jukujikun) reading split across kanji that don't have those readings
--    (眼鏡 め/がね, 真面目 ま/じ/め, ...), grouped like 大人/今日 already are; 日本 is already
--    ['にほん','-'], its compounds had 日 = に
  (5, '眼鏡', 'めがね', array['め','がね'], array['めがね','-'], array['megane','-']),
  (578, '二日', 'ふつか', array['ふつ','か'], array['ふつか','-'], array['futsuka','-']),
  (1981, '芝生', 'しばふ', array['しば','ふ'], array['しばふ','-'], array['shibafu','-']),
  (2549, '真面目', 'まじめ', array['ま','じ','め'], array['まじめ','-','-'], array['majime','-','-']),
  (6892, '生真面目', 'きまじめ', array['き','ま','じ','め'], array['き','まじめ','-','-'], array['ki','majime','-','-']),
  (2561, '真似', 'まね', array['ま','ね'], array['まね','-'], array['mane','-']),
  (3997, '真似る', 'まねる', array['ま','ね',''], array['まね','-',''], array['mane','-','']),
  (2968, '吹雪', 'ふぶき', array['ふ','ぶき'], array['ふぶき','-'], array['fubuki','-']),
  (4297, '大凡', 'おおよそ', array['おお','よそ'], array['おおよそ','-'], array['ooyoso','-']),
  (4307, '白髪', 'しらが', array['しら','が'], array['しらが','-'], array['shiraga','-']),
  (4463, '足袋', 'たび', array['た','び'], array['たび','-'], array['tabi','-']),
  (6129, '名残', 'なごり', array['な','ごり'], array['なごり','-'], array['nagori','-']),
  (6242, '玄人', 'くろうと', array['くろ','うと'], array['くろうと','-'], array['kurouto','-']),
  (6544, '何卒', 'なにとぞ', array['なに','とぞ'], array['なにとぞ','-'], array['nanitozo','-']),
  (6705, '日向', 'ひなた', array['ひ','なた'], array['ひなた','-'], array['hinata','-']),
  (9398, '行方', 'ゆくえ', array['ゆく','え'], array['ゆくえ','-'], array['yukue','-']),
  (11978, '欠片', 'かけら', array['かけ','ら'], array['かけら','-'], array['kakera','-']),
  (14814, '蚊帳', 'かや', array['か','や'], array['かや','-'], array['kaya','-']),
  (16231, '師走', 'しわす', array['し','わす'], array['しわす','-'], array['shiwasu','-']),
  (18151, '弥生', 'やよい', array['や','よい'], array['やよい','-'], array['yayoi','-']),
  (17460, '義太夫', 'ぎだゆう', array['ぎ','だ','ゆう'], array['ぎ','だゆう','-'], array['gi','dayuu','-']),
  (20337, '上手く行く', 'うまくいく', array['う','ま','','い',''], array['うま','-','','い',''], array['uma','-','','i','']),
  (3972, '目眩', 'めまい', array['め','まい'], array['めまい','-'], array['memai','-']),
  (8460, '薔薇', 'ばら', array['ば','ら'], array['ばら','-'], array['bara','-']),
  (3796, '躊躇う', 'ためらう', array['た','めら',''], array['ためら','-',''], array['tamera','-','']),
  (14670, '彷徨う', 'さまよう', array['さ','まよ',''], array['さまよ','-',''], array['samayo','-','']),
  (15111, '生姜', 'しょうが', array['しょう','が'], array['しょうが','-'], array['shouga','-']),
  (8463, '彼方', 'かなた', array['か','なた'], array['かなた','-'], array['kanata','-']),
  (8545, '鞦韆', 'ぶらんこ', array['ぶらん','こ'], array['ぶらんこ','-'], array['buranko','-']),
  (8605, '大蒜', 'にんにく', array['にんにく',''], array['にんにく','-'], array['ninniku','-']),
  (7715, '日本語', 'にほんご', array['に','ほん','ご'], array['にほん','-','ご'], array['nihon','-','go']),
  (8597, '日本料理', 'にほんりょうり', array['に','ほん','りょう','り'], array['にほん','-','りょう','り'], array['nihon','-','ryou','ri']),
  (10246, '日本式', 'にほんしき', array['に','ほん','しき'], array['にほん','-','しき'], array['nihon','-','shiki']),
  (12649, '日本経済', 'にほんけいざい', array['に','ほん','けい','ざい'], array['にほん','-','けい','ざい'], array['nihon','-','kei','zai']),
  (12703, '日本史', 'にほんし', array['に','ほん','し'], array['にほん','-','し'], array['nihon','-','shi']),
  (12779, '日本中', 'にほんじゅう', array['に','ほん','じゅう'], array['にほん','-','じゅう'], array['nihon','-','juu']),
  (12951, '日本初', 'にほんはつ', array['に','ほん','はつ'], array['にほん','-','はつ'], array['nihon','-','hatsu']),
  (13125, '日本人', 'にほんじん', array['に','ほん','じん'], array['にほん','-','じん'], array['nihon','-','jin']),
  (13139, '日本酒', 'にほんしゅ', array['に','ほん','しゅ'], array['にほん','-','しゅ'], array['nihon','-','shu']),
  (13953, '日本一', 'にほんいち', array['に','ほん','いち'], array['にほん','-','いち'], array['nihon','-','ichi']),
  (14366, '日本道路公団', 'にほんどうろこうだん', array['に','ほん','どう','ろ','こう','だん'], array['にほん','-','どう','ろ','こう','だん'], array['nihon','-','dou','ro','kou','dan']),
  (18634, '日本社会', 'にほんしゃかい', array['に','ほん','しゃ','かい'], array['にほん','-','しゃ','かい'], array['nihon','-','sha','kai']),
  (18637, '日本政府', 'にほんせいふ', array['に','ほん','せい','ふ'], array['にほん','-','せい','ふ'], array['nihon','-','sei','fu']),
  (18729, '日本製', 'にほんせい', array['に','ほん','せい'], array['にほん','-','せい'], array['nihon','-','sei']),
  (20209, '日本学術会議', 'にほんがくじゅつかいぎ', array['に','ほん','がく','じゅつ','かい','ぎ'], array['にほん','-','がく','じゅつ','かい','ぎ'], array['nihon','-','gaku','jutsu','kai','gi']),
-- e) furiganas already right, only romaji_furiganas wrong (missing っ, '-' vs '', a stray '\r\n' string,
--    too short)
  (7421, '十分', 'じっぷん', array['じっ','ぷん'], array['じっ','ぷん'], array['jip','pun']),
  (5653, '心地', 'ここち', array['ここち','-'], array['ここち','-'], array['kokochi','-']),
  (12776, '此処等', 'ここら', array['ここ','-','ら'], array['ここ','-','ら'], array['koko','-','ra']),
  (13007, 'で', 'で', array[''], array[''], array['']),
  (20352, '百円ショップ', 'ひゃくえんショップ', array['ひゃく','えん','','','',''], array['ひゃく','えん','','','',''], array['hyaku','en','','','','']);

create temp table _reading_group_fix (
  id bigint primary key,
  id_kanji bigint not null,
  id_word bigint not null,
  old_group integer not null,
  new_group integer not null
);

-- kanji_word id, kanji id, vocabulary id, old group, new group  -- word kanji: old reading -> new
-- ("~X@n" = n-th kanji under the shared furigana X)
insert into _reading_group_fix (id, id_kanji, id_word, old_group, new_group) values
  (8, 1, 578, 4, 18),  -- 二日 日: か -> ~ふつか@1
  (27, 1, 7715, 5, 14),  -- 日本語 日: に -> ~にほん@0
  (34, 1, 12779, 5, 14),  -- 日本中 日: に -> ~にほん@0
  (35, 1, 13125, 5, 14),  -- 日本人 日: に -> ~にほん@0
  (36, 1, 13953, 5, 14),  -- 日本一 日: に -> ~にほん@0
  (72, 1, 8597, 5, 14),  -- 日本料理 日: に -> ~にほん@0
  (77, 1, 18634, 5, 14),  -- 日本社会 日: に -> ~にほん@0
  (96, 1, 10246, 5, 14),  -- 日本式 日: に -> ~にほん@0
  (101, 1, 12649, 5, 14),  -- 日本経済 日: に -> ~にほん@0
  (102, 1, 12951, 5, 14),  -- 日本初 日: に -> ~にほん@0
  (103, 1, 13139, 5, 14),  -- 日本酒 日: に -> ~にほん@0
  (110, 1, 20209, 5, 14),  -- 日本学術会議 日: に -> ~にほん@0
  (133, 1, 12703, 5, 14),  -- 日本史 日: に -> ~にほん@0
  (134, 1, 14366, 5, 14),  -- 日本道路公団 日: に -> ~にほん@0
  (139, 1, 18637, 5, 14),  -- 日本政府 日: に -> ~にほん@0
  (151, 1, 6705, 1, 19),  -- 日向 日: ひ -> ~ひなた@0
  (162, 1, 18729, 5, 14),  -- 日本製 日: に -> ~にほん@0
  (572, 4, 12025, 5, 1),  -- 死人 人: ん -> にん
  (851, 6, 12081, 4, 1),  -- 大急ぎ 大: おおい -> おお
  (917, 6, 4297, 1, 7),  -- 大凡 大: おお -> ~おおよそ@0
  (1088, 9, 7715, 0, 2),  -- 日本語 本: ほん -> ~にほん@1
  (1091, 9, 12779, 0, 2),  -- 日本中 本: ほん -> ~にほん@1
  (1093, 9, 13125, 0, 2),  -- 日本人 本: ほん -> ~にほん@1
  (1094, 9, 13953, 0, 2),  -- 日本一 本: ほん -> ~にほん@1
  (1100, 9, 8597, 0, 2),  -- 日本料理 本: ほん -> ~にほん@1
  (1113, 9, 18634, 0, 2),  -- 日本社会 本: ほん -> ~にほん@1
  (1123, 9, 10246, 0, 2),  -- 日本式 本: ほん -> ~にほん@1
  (1128, 9, 12649, 0, 2),  -- 日本経済 本: ほん -> ~にほん@1
  (1129, 9, 12951, 0, 2),  -- 日本初 本: ほん -> ~にほん@1
  (1130, 9, 13139, 0, 2),  -- 日本酒 本: ほん -> ~にほん@1
  (1139, 9, 20209, 0, 2),  -- 日本学術会議 本: ほん -> ~にほん@1
  (1146, 9, 12703, 0, 2),  -- 日本史 本: ほん -> ~にほん@1
  (1148, 9, 14366, 0, 2),  -- 日本道路公団 本: ほん -> ~にほん@1
  (1154, 9, 18637, 0, 2),  -- 日本政府 本: ほん -> ~にほん@1
  (1177, 9, 18729, 0, 2),  -- 日本製 本: ほん -> ~にほん@1
  (1641, 15, 9398, 5, 6),  -- 行方 行: ゆく -> ~ゆくえ@0
  (2121, 20, 15111, 1, 11),  -- 生姜 生: しょう -> ~しょうが@0
  (2259, 23, 20337, 8, 9),  -- 上手く行く 上: う -> ~うま@0
  (2812, 33, 8733, 7, 1),  -- 子牛 子: こう -> こ
  (3200, 39, 5529, 4, 0),  -- 浮気 気: わき -> き
  (3627, 50, 6129, 1, 3),  -- 名残 名: な -> ~なごり@0
  (4166, 65, 6544, 1, 14),  -- 何卒 何: なに -> ~なにとぞ@0
  (4240, 69, 4307, 2, 7),  -- 白髪 白: しら -> ~しらが@0
  (5350, 90, 9398, 8, 9),  -- 行方 方: え -> ~ゆくえ@1
  (5764, 96, 20337, 4, 5),  -- 上手く行く 手: ま -> ~うま@1
  (6169, 103, 2549, 0, 4),  -- 真面目 目: め -> ~まじめ@2
  (6193, 103, 3972, 0, 5),  -- 目眩 目: め -> ~めまい@0
  (6225, 103, 6892, 0, 4),  -- 生真面目 目: め -> ~まじめ@2
  (6931, 115, 4071, 3, 4),  -- 目出度い 度: たい -> た
  (7707, 136, 18488, 2, 1),  -- 画数 画: かくす -> かく
  (8191, 147, 12025, 1, 0),  -- 死人 死: しに -> し
  (8421, 157, 2549, 0, 2),  -- 真面目 真: ま -> ~まじめ@0
  (8422, 157, 2561, 0, 3),  -- 真似 真: ま -> ~まね@0
  (8431, 157, 3997, 0, 3),  -- 真似る 真: ま -> ~まね@0
  (8442, 157, 6892, 0, 2),  -- 生真面目 真: ま -> ~まじめ@0
  (8708, 166, 12081, 2, 1),  -- 大急ぎ 急: そ -> いそ
  (8925, 172, 4463, 2, 4),  -- 足袋 足: た -> ~たび@0
  (9516, 198, 13924, 1, 2),  -- 注ぎ込む 注: そそ -> つ
  (9577, 201, 14006, 3, 0),  -- 詩歌 歌: いか -> か
  (9795, 210, 10402, 2, 0),  -- 黒色 黒: くろい -> くろ
  (9851, 213, 13811, 2, 0),  -- 赤色 赤: あかい -> あか
  (9866, 214, 12792, 2, 0),  -- 青色 青: あおい -> あお
  (9937, 217, 10402, 3, 0),  -- 黒色 色: ろ -> いろ
  (9939, 217, 12792, 3, 0),  -- 青色 色: ろ -> いろ
  (9940, 217, 13811, 3, 0),  -- 赤色 色: ろ -> いろ
  (10210, 240, 8733, 1, 2),  -- 子牛 牛: し -> うし
  (12223, 292, 18488, 3, 0),  -- 画数 数: う -> すう
  (12858, 313, 2549, 2, 8),  -- 真面目 面: じ -> ~まじめ@1
  (12908, 313, 6892, 2, 8),  -- 生真面目 面: じ -> ~まじめ@1
  (14875, 395, 6129, 2, 3),  -- 名残 残: ごり -> ~なごり@1
  (16066, 453, 17460, 2, 6),  -- 義太夫 太: だ -> ~だゆう@0
  (16106, 456, 16231, 0, 1),  -- 師走 師: し -> ~しわす@0
  (16798, 498, 2894, 0, 3),  -- 背 背: せ -> せい
  (16988, 510, 6954, 2, 4),  -- 留める 留: と -> とど
  (17523, 553, 2561, 1, 3),  -- 真似 似: ね -> ~まね@1
  (17528, 553, 3997, 1, 3),  -- 真似る 似: ね -> ~まね@1
  (17815, 580, 2968, 0, 3),  -- 吹雪 吹: ふ -> ~ふぶき@0
  (20982, 856, 14631, 0, 2),  -- 埋める 埋: う -> うず
  (21777, 995, 7619, 1, 3),  -- 基 基: もと -> もとい
  (23899, 1241, 1981, 0, 1),  -- 芝生 芝: しば -> ~しばふ@0
  (25829, 1848, 15722, 0, 1),  -- 鶏 鶏: とり -> にわとり
  (26001, 1991, 14814, 0, 1);  -- 蚊帳 蚊: か -> ~かや@0


do $$
declare
  v_bad text;
begin
  select string_agg(format('%s %s (id %s)', f.word, coalesce(v.furiganas::text, 'missing row'), f.id), ', ')
    into v_bad
  from _furigana_fix f
  left join public.vocabulary v on v.id = f.id
  where v.id is null
     or v.word is distinct from f.word
     or v.kana_reading is distinct from f.kana_reading
     or (v.furiganas is distinct from f.old_furiganas and v.furiganas is distinct from f.new_furiganas);
  if v_bad is not null then
    raise exception 'vocabulary rows differ from what this migration was written against: %', v_bad;
  end if;

  select string_agg(format('kanji_word %s (group %s)', g.id, coalesce(kw.reading_group::text, 'missing row')), ', ')
    into v_bad
  from _reading_group_fix g
  left join public.kanji_word kw on kw.id = g.id
  where kw.id is null
     or kw.id_kanji is distinct from g.id_kanji
     or kw.id_word is distinct from g.id_word
     or kw.reading_group not in (g.old_group, g.new_group);
  if v_bad is not null then
    raise exception 'kanji_word rows differ from what this migration was written against: %', v_bad;
  end if;
end $$;

update public.vocabulary v
set furiganas = f.new_furiganas,
    romaji_furiganas = f.new_romaji_furiganas
from _furigana_fix f
where v.id = f.id
  and (v.furiganas is distinct from f.new_furiganas
       or v.romaji_furiganas is distinct from f.new_romaji_furiganas);

update public.kanji_word kw
set reading_group = g.new_group
from _reading_group_fix g
where kw.id = g.id
  and kw.reading_group <> g.new_group;

drop table _furigana_fix;
drop table _reading_group_fix;

-- Words whose furigana is now shared between kanji (眼鏡, 真面目, 日本人, ...) leave the per-kanji
-- example lists, and the 大急ぎ-style singleton groups are gone.
select public.rebuild_kanji_detail_words();
