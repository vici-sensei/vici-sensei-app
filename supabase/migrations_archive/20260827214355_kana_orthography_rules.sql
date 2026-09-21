-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Kana learning track, phase 3: fill the two gaps left in hiragana/katakana's reference data
-- (see 20260822_kana_tables.sql) --
--
--  1. Every existing row gets a `kana_type` label (seion/dakuten/handakuten/yoon) derived from
--     its gojuon_row, so the app can group/explain by rule category instead of hardcoding
--     gojuon_row lists everywhere.
--  2. Two orthography rules that don't fit the "one character, one fixed romaji" model the
--     original table was designed around (see that file's header comment) get their own rows
--     anyway, split into a `rule` (a single explanatory row, character + notes) followed by
--     several `example` rows illustrating it in context:
--       - sokuon (っ/ッ): doubles the consonant of the following syllable, no sound of its own.
--         20 native combinations (k/s/t/p rows) in both scripts, plus 5 voiced-consonant
--         combinations that only occur in katakana loanwords (バッグ, ベッド, ...).
--       - chōon: vowel lengthening. Katakana has a dedicated mark (ー) that's the same
--         regardless of the preceding vowel; hiragana has no dedicated mark at all -- it reuses
--         the ordinary vowel kana, spelled differently per row (see the rule row's `notes`).
--  3. Katakana only: the extended set of combinations used to transliterate loanword sounds not
--     covered by the classical gojuon chart (ファ, ヴァ, ティ, ...), from the 1991 gairaigo
--     cabinet notice. These *are* ordinary drillable characters (entry_kind = 'character'),
--     just loanword-sourced -- tagged with a frequency_tier (core/rare/very_rare) since some are
--     far more common than others.
--
-- New columns are added to both tables uniformly even though a couple only vary in one script
-- (e.g. frequency_tier only really differentiates within katakana) -- keeping the schema
-- identical between hiragana/katakana avoids special-casing either table in application code.
--
-- entry_kind = 'rule'/'example' rows deliberately still flow through get_new_hiragana_candidates/
-- get_new_katakana_candidates and introduce_hiragana/introduce_katakana untouched -- they're
-- ordinary rows with a gojuon_row and a romaji "answer", so they're introduced and drilled
-- exactly like any other character with no RPC changes needed. Browse (lib/data/kana.ts) is what
-- was taught to tell them apart, splitting them into their own page sections.

alter table public.hiragana
  add column kana_type text not null default 'seion',
  add column entry_kind text not null default 'character',
  add column sound_origin text not null default 'native',
  add column frequency_tier text not null default 'core',
  add column notes text;

alter table public.katakana
  add column kana_type text not null default 'seion',
  add column entry_kind text not null default 'character',
  add column sound_origin text not null default 'native',
  add column frequency_tier text not null default 'core',
  add column notes text;

alter table public.hiragana
  add constraint hiragana_kana_type_check
    check (kana_type = any (array['seion', 'dakuten', 'handakuten', 'yoon', 'sokuon', 'choonpu', 'extended'])),
  add constraint hiragana_entry_kind_check
    check (entry_kind = any (array['character', 'rule', 'example'])),
  add constraint hiragana_sound_origin_check
    check (sound_origin = any (array['native', 'loanword'])),
  add constraint hiragana_frequency_tier_check
    check (frequency_tier = any (array['core', 'rare', 'very_rare']));

alter table public.katakana
  add constraint katakana_kana_type_check
    check (kana_type = any (array['seion', 'dakuten', 'handakuten', 'yoon', 'sokuon', 'choonpu', 'extended'])),
  add constraint katakana_entry_kind_check
    check (entry_kind = any (array['character', 'rule', 'example'])),
  add constraint katakana_sound_origin_check
    check (sound_origin = any (array['native', 'loanword'])),
  add constraint katakana_frequency_tier_check
    check (frequency_tier = any (array['core', 'rare', 'very_rare']));

-- Backfill kana_type on the 104 existing rows per table (default 'seion' already covers the
-- base 46 -- dakuten/handakuten/yoon rows are re-labeled by their existing gojuon_row).
update public.hiragana set kana_type = 'dakuten' where gojuon_row in ('ga', 'za', 'da', 'ba');
update public.hiragana set kana_type = 'handakuten' where gojuon_row = 'pa';
update public.hiragana set kana_type = 'yoon'
  where gojuon_row in ('kya', 'sha', 'cha', 'nya', 'hya', 'mya', 'rya', 'gya', 'ja', 'bya', 'pya');

update public.katakana set kana_type = 'dakuten' where gojuon_row in ('ga', 'za', 'da', 'ba');
update public.katakana set kana_type = 'handakuten' where gojuon_row = 'pa';
update public.katakana set kana_type = 'yoon'
  where gojuon_row in ('kya', 'sha', 'cha', 'nya', 'hya', 'mya', 'rya', 'gya', 'ja', 'bya', 'pya');

-- ---------------------------------------------------------------------------
-- Hiragana: sokuon (rule + 20 native examples) and chōon (rule + 7 examples).
-- sort_order continues from 104. romaji stays plain ASCII throughout (no macrons) to match the
-- existing 104 rows and stay typeable against submit_review's exact-match grading.
-- ---------------------------------------------------------------------------
insert into public.hiragana
  (character, romaji, gojuon_row, sort_order, kana_type, entry_kind, sound_origin, frequency_tier, notes) values
  ('っ', 'sokuon', 'sokuon_rule', 105, 'sokuon', 'rule', 'native', 'core',
    'Sokuon: a small tsu with no sound of its own -- it marks gemination, doubling the consonant of the syllable that follows (a brief stop before it). Example: がっこう (gakkou, "school") = ga-k-kou.'),

  ('っか', 'kka', 'sokuon_ka', 106, 'sokuon', 'example', 'native', 'core', null),
  ('っき', 'kki', 'sokuon_ka', 107, 'sokuon', 'example', 'native', 'core', null),
  ('っく', 'kku', 'sokuon_ka', 108, 'sokuon', 'example', 'native', 'core', null),
  ('っけ', 'kke', 'sokuon_ka', 109, 'sokuon', 'example', 'native', 'core', null),
  ('っこ', 'kko', 'sokuon_ka', 110, 'sokuon', 'example', 'native', 'core', null),

  ('っさ', 'ssa', 'sokuon_sa', 111, 'sokuon', 'example', 'native', 'core', null),
  ('っし', 'sshi', 'sokuon_sa', 112, 'sokuon', 'example', 'native', 'core', null),
  ('っす', 'ssu', 'sokuon_sa', 113, 'sokuon', 'example', 'native', 'core', null),
  ('っせ', 'sse', 'sokuon_sa', 114, 'sokuon', 'example', 'native', 'core', null),
  ('っそ', 'sso', 'sokuon_sa', 115, 'sokuon', 'example', 'native', 'core', null),

  ('った', 'tta', 'sokuon_ta', 116, 'sokuon', 'example', 'native', 'core', null),
  ('っち', 'cchi', 'sokuon_ta', 117, 'sokuon', 'example', 'native', 'core', null),
  ('っつ', 'ttsu', 'sokuon_ta', 118, 'sokuon', 'example', 'native', 'core', null),
  ('って', 'tte', 'sokuon_ta', 119, 'sokuon', 'example', 'native', 'core', null),
  ('っと', 'tto', 'sokuon_ta', 120, 'sokuon', 'example', 'native', 'core', null),

  ('っぱ', 'ppa', 'sokuon_pa', 121, 'sokuon', 'example', 'native', 'core', null),
  ('っぴ', 'ppi', 'sokuon_pa', 122, 'sokuon', 'example', 'native', 'core', null),
  ('っぷ', 'ppu', 'sokuon_pa', 123, 'sokuon', 'example', 'native', 'core', null),
  ('っぺ', 'ppe', 'sokuon_pa', 124, 'sokuon', 'example', 'native', 'core', null),
  ('っぽ', 'ppo', 'sokuon_pa', 125, 'sokuon', 'example', 'native', 'core', null),

  ('ー', 'choon', 'choonpu_rule', 126, 'choonpu', 'rule', 'native', 'core',
    'Chōon (vowel lengthening) in hiragana has no dedicated mark -- it reuses the ordinary vowel kana. a-row + あ, i-row + い, and u-row + う are always spelled this way. The e-row usually adds い (せんせい) though え appears in a handful of words (ねえさん); the o-row usually adds う (とうきょう) though お appears in a handful of words (おおきい, とお).'),

  ('ああ', 'aa', 'choonpu_example', 127, 'choonpu', 'example', 'native', 'core', null),
  ('いい', 'ii', 'choonpu_example', 128, 'choonpu', 'example', 'native', 'core', null),
  ('うう', 'uu', 'choonpu_example', 129, 'choonpu', 'example', 'native', 'core', null),
  ('えい', 'ei', 'choonpu_example', 130, 'choonpu', 'example', 'native', 'core', null),
  ('ええ', 'ee', 'choonpu_example', 131, 'choonpu', 'example', 'native', 'core', null),
  ('おう', 'ou', 'choonpu_example', 132, 'choonpu', 'example', 'native', 'core', null),
  ('おお', 'oo', 'choonpu_example', 133, 'choonpu', 'example', 'native', 'core', null);

-- ---------------------------------------------------------------------------
-- Katakana: sokuon (rule + 20 native + 5 loanword examples), chōon (rule + 5 examples), and the
-- extended loanword set (34 characters across 3 frequency tiers). sort_order continues from 104.
-- ---------------------------------------------------------------------------
insert into public.katakana
  (character, romaji, gojuon_row, sort_order, kana_type, entry_kind, sound_origin, frequency_tier, notes) values
  ('ッ', 'sokuon', 'sokuon_rule', 105, 'sokuon', 'rule', 'native', 'core',
    'Sokuon: a small tsu with no sound of its own -- it marks gemination, doubling the consonant of the syllable that follows (a brief stop before it). In katakana it also appears before voiced consonants in loanwords, e.g. バッグ (baggu, "bag").'),

  ('ッカ', 'kka', 'sokuon_ka', 106, 'sokuon', 'example', 'native', 'core', null),
  ('ッキ', 'kki', 'sokuon_ka', 107, 'sokuon', 'example', 'native', 'core', null),
  ('ック', 'kku', 'sokuon_ka', 108, 'sokuon', 'example', 'native', 'core', null),
  ('ッケ', 'kke', 'sokuon_ka', 109, 'sokuon', 'example', 'native', 'core', null),
  ('ッコ', 'kko', 'sokuon_ka', 110, 'sokuon', 'example', 'native', 'core', null),

  ('ッサ', 'ssa', 'sokuon_sa', 111, 'sokuon', 'example', 'native', 'core', null),
  ('ッシ', 'sshi', 'sokuon_sa', 112, 'sokuon', 'example', 'native', 'core', null),
  ('ッス', 'ssu', 'sokuon_sa', 113, 'sokuon', 'example', 'native', 'core', null),
  ('ッセ', 'sse', 'sokuon_sa', 114, 'sokuon', 'example', 'native', 'core', null),
  ('ッソ', 'sso', 'sokuon_sa', 115, 'sokuon', 'example', 'native', 'core', null),

  ('ッタ', 'tta', 'sokuon_ta', 116, 'sokuon', 'example', 'native', 'core', null),
  ('ッチ', 'cchi', 'sokuon_ta', 117, 'sokuon', 'example', 'native', 'core', null),
  ('ッツ', 'ttsu', 'sokuon_ta', 118, 'sokuon', 'example', 'native', 'core', null),
  ('ッテ', 'tte', 'sokuon_ta', 119, 'sokuon', 'example', 'native', 'core', null),
  ('ット', 'tto', 'sokuon_ta', 120, 'sokuon', 'example', 'native', 'core', null),

  ('ッパ', 'ppa', 'sokuon_pa', 121, 'sokuon', 'example', 'native', 'core', null),
  ('ッピ', 'ppi', 'sokuon_pa', 122, 'sokuon', 'example', 'native', 'core', null),
  ('ップ', 'ppu', 'sokuon_pa', 123, 'sokuon', 'example', 'native', 'core', null),
  ('ッペ', 'ppe', 'sokuon_pa', 124, 'sokuon', 'example', 'native', 'core', null),
  ('ッポ', 'ppo', 'sokuon_pa', 125, 'sokuon', 'example', 'native', 'core', null),

  ('ッグ', 'ggu', 'sokuon_loanword', 126, 'sokuon', 'example', 'loanword', 'rare', null),
  ('ッズ', 'zzu', 'sokuon_loanword', 127, 'sokuon', 'example', 'loanword', 'rare', null),
  ('ッド', 'ddo', 'sokuon_loanword', 128, 'sokuon', 'example', 'loanword', 'rare', null),
  ('ッジ', 'jji', 'sokuon_loanword', 129, 'sokuon', 'example', 'loanword', 'rare', null),
  ('ッブ', 'bbu', 'sokuon_loanword', 130, 'sokuon', 'example', 'loanword', 'rare', null),

  ('ー', 'choon', 'choonpu_rule', 131, 'choonpu', 'rule', 'native', 'core',
    'Chōonpu: marks a lengthened vowel in katakana. Written the same way (ー) regardless of which vowel precedes it -- e.g. コーヒー (kōhī, "coffee") -- unlike hiragana, which reuses vowel kana instead of a dedicated mark.'),

  ('アー', 'aa', 'choonpu_example', 132, 'choonpu', 'example', 'native', 'core', null),
  ('イー', 'ii', 'choonpu_example', 133, 'choonpu', 'example', 'native', 'core', null),
  ('ウー', 'uu', 'choonpu_example', 134, 'choonpu', 'example', 'native', 'core', null),
  ('エー', 'ee', 'choonpu_example', 135, 'choonpu', 'example', 'native', 'core', null),
  ('オー', 'oo', 'choonpu_example', 136, 'choonpu', 'example', 'native', 'core', null),

  -- Extended katakana, core tier (19) -- the loanword combinations most textbooks and IMEs teach.
  ('ヴァ', 'va', 'va', 137, 'extended', 'character', 'loanword', 'core', null),
  ('ヴィ', 'vi', 'va', 138, 'extended', 'character', 'loanword', 'core', null),
  ('ヴ', 'vu', 'va', 139, 'extended', 'character', 'loanword', 'core', null),
  ('ヴェ', 've', 'va', 140, 'extended', 'character', 'loanword', 'core', null),
  ('ヴォ', 'vo', 'va', 141, 'extended', 'character', 'loanword', 'core', null),
  ('シェ', 'she', 'she', 142, 'extended', 'character', 'loanword', 'core', null),
  ('ジェ', 'je', 'je', 143, 'extended', 'character', 'loanword', 'core', null),
  ('チェ', 'che', 'che', 144, 'extended', 'character', 'loanword', 'core', null),
  ('ティ', 'ti', 'ti', 145, 'extended', 'character', 'loanword', 'core', null),
  ('トゥ', 'tu', 'ti', 146, 'extended', 'character', 'loanword', 'core', null),
  ('ディ', 'di', 'di', 147, 'extended', 'character', 'loanword', 'core', null),
  ('ドゥ', 'du', 'di', 148, 'extended', 'character', 'loanword', 'core', null),
  ('ファ', 'fa', 'fa', 149, 'extended', 'character', 'loanword', 'core', null),
  ('フィ', 'fi', 'fa', 150, 'extended', 'character', 'loanword', 'core', null),
  ('フェ', 'fe', 'fa', 151, 'extended', 'character', 'loanword', 'core', null),
  ('フォ', 'fo', 'fa', 152, 'extended', 'character', 'loanword', 'core', null),
  ('ウィ', 'wi', 'wi', 153, 'extended', 'character', 'loanword', 'core', null),
  ('ウェ', 'we', 'wi', 154, 'extended', 'character', 'loanword', 'core', null),
  ('ウォ', 'wo', 'wi', 155, 'extended', 'character', 'loanword', 'core', null),

  -- Extended katakana, rare tier (9) -- seen in loanwords, but far less often than the core set.
  ('ツァ', 'tsa', 'tsa', 156, 'extended', 'character', 'loanword', 'rare', null),
  ('ツィ', 'tsi', 'tsa', 157, 'extended', 'character', 'loanword', 'rare', null),
  ('ツェ', 'tse', 'tsa', 158, 'extended', 'character', 'loanword', 'rare', null),
  ('ツォ', 'tso', 'tsa', 159, 'extended', 'character', 'loanword', 'rare', null),
  ('デュ', 'dyu', 'dyu', 160, 'extended', 'character', 'loanword', 'rare', null),
  ('フュ', 'fyu', 'fyu', 161, 'extended', 'character', 'loanword', 'rare', null),
  ('イェ', 'ye', 'ye', 162, 'extended', 'character', 'loanword', 'rare', null),
  ('クァ', 'kwa', 'kwa', 163, 'extended', 'character', 'loanword', 'rare', null),
  ('グァ', 'gwa', 'kwa', 164, 'extended', 'character', 'loanword', 'rare', null),

  -- Extended katakana, very_rare tier (6) -- the least common corner of the 1991 gairaigo list.
  ('クィ', 'kwi', 'kwi', 165, 'extended', 'character', 'loanword', 'very_rare', null),
  ('クェ', 'kwe', 'kwi', 166, 'extended', 'character', 'loanword', 'very_rare', null),
  ('クォ', 'kwo', 'kwi', 167, 'extended', 'character', 'loanword', 'very_rare', null),
  ('テュ', 'tyu', 'tyu', 168, 'extended', 'character', 'loanword', 'very_rare', null),
  ('ヴュ', 'vyu', 'vyu', 169, 'extended', 'character', 'loanword', 'very_rare', null),
  ('ヴョ', 'vyo', 'vyu', 170, 'extended', 'character', 'loanword', 'very_rare', null);
