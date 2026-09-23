-- EU-new + US-new BOTH, identical text (same reference data on both; the frozen project doesn't get it).
--
-- Partly reverts 20260923174750_fix_vocabulary_furigana_alignment.sql. That migration regrouped 33
-- words as a whole-word (jukujikun) reading, e.g. 真面目 ['ま','じ','め'] -> ['まじめ','-','-'],
-- treating the per-character split as an error because 面 has no reading じ. A second check against
-- English Wiktionary's per-kanji reading tables (ja-kanjitab) showed that the original values were
-- the etymological split Wiktionary itself uses, with the odd readings marked irregular/ateji:
-- 真(ま)面(じ)目(め), 眼(め)鏡(がね), 二(ふつ)日(か), 芝(しば)生(ふ), 玄(くろ)人(うと), 日(に)本(ほん) ...
-- (ja.wikipedia 熟字訓 also names 玄人 as decomposable, not jukujikun). JmdictFurigana groups them,
-- Wiktionary splits them -- a convention, not an error, so the original data stays.
--
-- Restored exactly to their pre-20260923174750 values (furiganas, romaji_furiganas, and the 52
-- kanji_word.reading_group moves of these words): 眼鏡 二日 芝生 真面目 生真面目 真似 真似る 白髪 名残
-- 玄人 何卒 日向 行方 師走 弥生 義太夫 生姜 彼方 and the 15 日本 compounds (日本語 日本人 ...).
-- Kept from 20260923174750 (42 rows, all confirmed by Wiktionary and/or JmdictFurigana): the
-- wrong-boundary splits (大急ぎ ...), readings that didn't spell the word (先 さっき ...), furigana
-- over kana, the romaji-only fixes, and the 12 regroupings Wiktionary itself marks as jukujikun
-- (吹雪 足袋 蚊帳 欠片 大凡 目眩 薔薇 躊躇う 彷徨う 鞦韆 大蒜 上手く行く).
--
-- Idempotent and guarded like the migration it reverts: a row is only touched if it holds either
-- the 20260923174750 value or the original one; anything else aborts.

create temp table _furigana_revert (
  id bigint primary key,
  word text not null,
  kana_reading text not null,
  migrated_furiganas text[] not null,
  original_furiganas text[] not null,
  original_romaji_furiganas text[] not null
);

insert into _furigana_revert (id, word, kana_reading, migrated_furiganas, original_furiganas, original_romaji_furiganas) values
  (5, '眼鏡', 'めがね', array['めがね','-'], array['め','がね'], array['me','gane']),
  (578, '二日', 'ふつか', array['ふつか','-'], array['ふつ','か'], array['futsu','ka']),
  (1981, '芝生', 'しばふ', array['しばふ','-'], array['しば','ふ'], array['shiba','fu']),
  (2549, '真面目', 'まじめ', array['まじめ','-','-'], array['ま','じ','め'], array['ma','ji','me']),
  (6892, '生真面目', 'きまじめ', array['き','まじめ','-','-'], array['き','ま','じ','め'], array['ki','ma','ji','me']),
  (2561, '真似', 'まね', array['まね','-'], array['ま','ね'], array['ma','ne']),
  (3997, '真似る', 'まねる', array['まね','-',''], array['ま','ね',''], array['ma','ne','']),
  (4307, '白髪', 'しらが', array['しらが','-'], array['しら','が'], array['shira','ga']),
  (6129, '名残', 'なごり', array['なごり','-'], array['な','ごり'], array['na','gori']),
  (6242, '玄人', 'くろうと', array['くろうと','-'], array['くろ','うと'], array['kuro','uto']),
  (6544, '何卒', 'なにとぞ', array['なにとぞ','-'], array['なに','とぞ'], array['nani','tozo']),
  (6705, '日向', 'ひなた', array['ひなた','-'], array['ひ','なた'], array['hi','nata']),
  (9398, '行方', 'ゆくえ', array['ゆくえ','-'], array['ゆく','え'], array['yuku','e']),
  (16231, '師走', 'しわす', array['しわす','-'], array['し','わす'], array['shi','wasu']),
  (18151, '弥生', 'やよい', array['やよい','-'], array['や','よい'], array['ya','yoi']),
  (17460, '義太夫', 'ぎだゆう', array['ぎ','だゆう','-'], array['ぎ','だ','ゆう'], array['gi','da','yuu']),
  (15111, '生姜', 'しょうが', array['しょうが','-'], array['しょう','が'], array['shou','ga']),
  (8463, '彼方', 'かなた', array['かなた','-'], array['か','なた'], array['ka','nata']),
  (7715, '日本語', 'にほんご', array['にほん','-','ご'], array['に','ほん','ご'], array['ni','hon','go']),
  (8597, '日本料理', 'にほんりょうり', array['にほん','-','りょう','り'], array['に','ほん','りょう','り'], array['ni','hon','ryou','ri']),
  (10246, '日本式', 'にほんしき', array['にほん','-','しき'], array['に','ほん','しき'], array['ni','hon','shiki']),
  (12649, '日本経済', 'にほんけいざい', array['にほん','-','けい','ざい'], array['に','ほん','けい','ざい'], array['ni','hon','kei','zai']),
  (12703, '日本史', 'にほんし', array['にほん','-','し'], array['に','ほん','し'], array['ni','hon','shi']),
  (12779, '日本中', 'にほんじゅう', array['にほん','-','じゅう'], array['に','ほん','じゅう'], array['ni','hon','juu']),
  (12951, '日本初', 'にほんはつ', array['にほん','-','はつ'], array['に','ほん','はつ'], array['ni','hon','hatsu']),
  (13125, '日本人', 'にほんじん', array['にほん','-','じん'], array['に','ほん','じん'], array['ni','hon','jin']),
  (13139, '日本酒', 'にほんしゅ', array['にほん','-','しゅ'], array['に','ほん','しゅ'], array['ni','hon','shu']),
  (13953, '日本一', 'にほんいち', array['にほん','-','いち'], array['に','ほん','いち'], array['ni','hon','ichi']),
  (14366, '日本道路公団', 'にほんどうろこうだん', array['にほん','-','どう','ろ','こう','だん'], array['に','ほん','どう','ろ','こう','だん'], array['ni','hon','dou','ro','kou','dan']),
  (18634, '日本社会', 'にほんしゃかい', array['にほん','-','しゃ','かい'], array['に','ほん','しゃ','かい'], array['ni','hon','sha','kai']),
  (18637, '日本政府', 'にほんせいふ', array['にほん','-','せい','ふ'], array['に','ほん','せい','ふ'], array['ni','hon','sei','fu']),
  (18729, '日本製', 'にほんせい', array['にほん','-','せい'], array['に','ほん','せい'], array['ni','hon','sei']),
  (20209, '日本学術会議', 'にほんがくじゅつかいぎ', array['にほん','-','がく','じゅつ','かい','ぎ'], array['に','ほん','がく','じゅつ','かい','ぎ'], array['ni','hon','gaku','jutsu','kai','gi']);

create temp table _reading_group_revert (
  id bigint primary key,
  id_kanji bigint not null,
  id_word bigint not null,
  migrated_group integer not null,
  original_group integer not null
);

-- kanji_word id, kanji id, vocabulary id, group set by 20260923174750, original group
insert into _reading_group_revert (id, id_kanji, id_word, migrated_group, original_group) values
  (8, 1, 578, 18, 4),  -- 二日 日
  (27, 1, 7715, 14, 5),  -- 日本語 日
  (34, 1, 12779, 14, 5),  -- 日本中 日
  (35, 1, 13125, 14, 5),  -- 日本人 日
  (36, 1, 13953, 14, 5),  -- 日本一 日
  (72, 1, 8597, 14, 5),  -- 日本料理 日
  (77, 1, 18634, 14, 5),  -- 日本社会 日
  (96, 1, 10246, 14, 5),  -- 日本式 日
  (101, 1, 12649, 14, 5),  -- 日本経済 日
  (102, 1, 12951, 14, 5),  -- 日本初 日
  (103, 1, 13139, 14, 5),  -- 日本酒 日
  (110, 1, 20209, 14, 5),  -- 日本学術会議 日
  (133, 1, 12703, 14, 5),  -- 日本史 日
  (134, 1, 14366, 14, 5),  -- 日本道路公団 日
  (139, 1, 18637, 14, 5),  -- 日本政府 日
  (151, 1, 6705, 19, 1),  -- 日向 日
  (162, 1, 18729, 14, 5),  -- 日本製 日
  (1088, 9, 7715, 2, 0),  -- 日本語 本
  (1091, 9, 12779, 2, 0),  -- 日本中 本
  (1093, 9, 13125, 2, 0),  -- 日本人 本
  (1094, 9, 13953, 2, 0),  -- 日本一 本
  (1100, 9, 8597, 2, 0),  -- 日本料理 本
  (1113, 9, 18634, 2, 0),  -- 日本社会 本
  (1123, 9, 10246, 2, 0),  -- 日本式 本
  (1128, 9, 12649, 2, 0),  -- 日本経済 本
  (1129, 9, 12951, 2, 0),  -- 日本初 本
  (1130, 9, 13139, 2, 0),  -- 日本酒 本
  (1139, 9, 20209, 2, 0),  -- 日本学術会議 本
  (1146, 9, 12703, 2, 0),  -- 日本史 本
  (1148, 9, 14366, 2, 0),  -- 日本道路公団 本
  (1154, 9, 18637, 2, 0),  -- 日本政府 本
  (1177, 9, 18729, 2, 0),  -- 日本製 本
  (1641, 15, 9398, 6, 5),  -- 行方 行
  (2121, 20, 15111, 11, 1),  -- 生姜 生
  (3627, 50, 6129, 3, 1),  -- 名残 名
  (4166, 65, 6544, 14, 1),  -- 何卒 何
  (4240, 69, 4307, 7, 2),  -- 白髪 白
  (5350, 90, 9398, 9, 8),  -- 行方 方
  (6169, 103, 2549, 4, 0),  -- 真面目 目
  (6225, 103, 6892, 4, 0),  -- 生真面目 目
  (8421, 157, 2549, 2, 0),  -- 真面目 真
  (8422, 157, 2561, 3, 0),  -- 真似 真
  (8431, 157, 3997, 3, 0),  -- 真似る 真
  (8442, 157, 6892, 2, 0),  -- 生真面目 真
  (12858, 313, 2549, 8, 2),  -- 真面目 面
  (12908, 313, 6892, 8, 2),  -- 生真面目 面
  (14875, 395, 6129, 3, 2),  -- 名残 残
  (16066, 453, 17460, 6, 2),  -- 義太夫 太
  (16106, 456, 16231, 1, 0),  -- 師走 師
  (17523, 553, 2561, 3, 1),  -- 真似 似
  (17528, 553, 3997, 3, 1),  -- 真似る 似
  (23899, 1241, 1981, 1, 0);  -- 芝生 芝

do $$
declare
  v_bad text;
begin
  select string_agg(format('%s %s (id %s)', f.word, coalesce(v.furiganas::text, 'missing row'), f.id), ', ')
    into v_bad
  from _furigana_revert f
  left join public.vocabulary v on v.id = f.id
  where v.id is null
     or v.word is distinct from f.word
     or v.kana_reading is distinct from f.kana_reading
     or (v.furiganas is distinct from f.migrated_furiganas and v.furiganas is distinct from f.original_furiganas);
  if v_bad is not null then
    raise exception 'vocabulary rows differ from what this migration was written against: %', v_bad;
  end if;

  select string_agg(format('kanji_word %s (group %s)', g.id, coalesce(kw.reading_group::text, 'missing row')), ', ')
    into v_bad
  from _reading_group_revert g
  left join public.kanji_word kw on kw.id = g.id
  where kw.id is null
     or kw.id_kanji is distinct from g.id_kanji
     or kw.id_word is distinct from g.id_word
     or kw.reading_group not in (g.migrated_group, g.original_group);
  if v_bad is not null then
    raise exception 'kanji_word rows differ from what this migration was written against: %', v_bad;
  end if;
end $$;

update public.vocabulary v
set furiganas = f.original_furiganas,
    romaji_furiganas = f.original_romaji_furiganas
from _furigana_revert f
where v.id = f.id
  and (v.furiganas is distinct from f.original_furiganas
       or v.romaji_furiganas is distinct from f.original_romaji_furiganas);

update public.kanji_word kw
set reading_group = g.original_group
from _reading_group_revert g
where kw.id = g.id
  and kw.reading_group <> g.original_group;

drop table _furigana_revert;
drop table _reading_group_revert;

select public.rebuild_kanji_detail_words();
