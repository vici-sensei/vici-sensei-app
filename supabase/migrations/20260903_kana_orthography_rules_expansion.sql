-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Follow-up to 20260903_kana_orthography_rules.sql, closing gaps a Japanese teacher's notes and
-- a closer look at "what actually counts as a reading rule" surfaced:
--
--  1. Yōon (きゃ/しゃ/ちゃ...) is reclassified from entry_kind='character' to 'example', with a
--     new 'rule' row explaining it -- it's exactly as much a "reading rule" as sokuon/chōon
--     (two hiragana pronounced as one connected sound), it just didn't get the same treatment in
--     the first pass. The 33 characters per script are untouched otherwise -- same id, same
--     romaji, same gojuon_row -- so this only changes which Browse section they render in, not
--     their SRS progress or introduction behavior.
--  2. Sokuon before a yōon combination (っきゃ, っしゅ, ...) -- e.g. ろっぴゃく (roppyaku, "600"),
--     一緒 いっしょ (issho, "together") -- was missing from the first pass, which only covered
--     sokuon before a plain kana.
--  3. ん-gemination: a *different* mechanism from sokuon that produces a similar doubled-consonant
--     effect -- ん immediately followed by a な-row kana (みんな minna "everyone", てんない tennai
--     "inside the store") sounds like a doubled n, with no small つ involved. Gets its own
--     kana_type since, unlike sokuon, no small tsu character appears at all.
--  4. Rendaku (連濁, "sequential voicing"): the first consonant of a compound's second element
--     often voices (て+かみ -> てがみ "letter"). Hiragana only -- native/Sino-Japanese
--     compounding, not something loanwords in katakana do. Irregular by nature (not every
--     compound voices), so it's presented as a tendency with examples, not a hard rule.
--  5. は/へ read as "wa"/"e" when used as grammatical particles (topic marker / direction marker)
--     instead of their normal "ha"/"he". Hiragana only -- purely a hiragana reading quirk (there's
--     no katakana equivalent since grammatical particles aren't written in katakana).
--  6. Historical characters: ゐ/ゑ (hiragana) and ヰ/ヱ (katakana) -- the wi/we slots of the
--     classical わ-row, obsolete in standard modern Japanese but still seen in names/branding.
--     Plus the iteration marks ゝ/ゞ (hiragana) and ヽ/ヾ (katakana), which repeat the preceding
--     kana (voiced or not) instead of having a sound of their own -- treated as rule rows for the
--     same reason sokuon/chōon are, since their "reading" only makes sense in context.
--
-- 'historical' is added as a new frequency_tier value (alongside core/rare/very_rare) rather than
-- introducing a whole separate column -- it answers the same underlying question ("how likely is
-- a learner to actually encounter this"), just at the far end of the scale from 'core'.
--
-- kana_type gains four new values: n_gemination, rendaku, particle_reading, historical.

alter table public.hiragana drop constraint hiragana_kana_type_check;
alter table public.hiragana add constraint hiragana_kana_type_check
  check (kana_type = any (array['seion', 'dakuten', 'handakuten', 'yoon', 'sokuon', 'choonpu', 'extended', 'n_gemination', 'rendaku', 'particle_reading', 'historical']));

alter table public.katakana drop constraint katakana_kana_type_check;
alter table public.katakana add constraint katakana_kana_type_check
  check (kana_type = any (array['seion', 'dakuten', 'handakuten', 'yoon', 'sokuon', 'choonpu', 'extended', 'n_gemination', 'rendaku', 'particle_reading', 'historical']));

alter table public.hiragana drop constraint hiragana_frequency_tier_check;
alter table public.hiragana add constraint hiragana_frequency_tier_check
  check (frequency_tier = any (array['core', 'rare', 'very_rare', 'historical']));

alter table public.katakana drop constraint katakana_frequency_tier_check;
alter table public.katakana add constraint katakana_frequency_tier_check
  check (frequency_tier = any (array['core', 'rare', 'very_rare', 'historical']));

-- Reclassify the 33 existing yōon characters per script: same id/character/romaji/gojuon_row,
-- just entry_kind 'character' -> 'example' so Browse renders them under Sound Rules &
-- Combinations instead of the main grid (matches sokuon/chōon's existing treatment).
update public.hiragana set entry_kind = 'example' where kana_type = 'yoon';
update public.katakana set entry_kind = 'example' where kana_type = 'yoon';

-- ---------------------------------------------------------------------------
-- Hiragana: continues from sort_order 133.
-- ---------------------------------------------------------------------------
insert into public.hiragana
  (character, romaji, gojuon_row, sort_order, kana_type, entry_kind, sound_origin, frequency_tier, notes) values

  ('きゃ', 'yoon', 'yoon_rule', 134, 'yoon', 'rule', 'native', 'core',
    'Yōon: a hiragana ending in "i" (き/し/ち/に/ひ/み/り, or their voiced forms ぎ/じ/び/ぴ) followed by a small ゃ/ゅ/ょ -- the two are pronounced together as one connected sound, not two separate syllables. きゃ is one mora (kya), not "ki" + "ya".'),

  ('っきゃ', 'kkya', 'sokuon_yoon', 135, 'sokuon', 'example', 'native', 'core', null),
  ('っきゅ', 'kkyu', 'sokuon_yoon', 136, 'sokuon', 'example', 'native', 'core', null),
  ('っきょ', 'kkyo', 'sokuon_yoon', 137, 'sokuon', 'example', 'native', 'core', null),
  ('っしゃ', 'ssha', 'sokuon_yoon', 138, 'sokuon', 'example', 'native', 'core', null),
  ('っしゅ', 'sshu', 'sokuon_yoon', 139, 'sokuon', 'example', 'native', 'core', null),
  ('っしょ', 'ssho', 'sokuon_yoon', 140, 'sokuon', 'example', 'native', 'core', null),
  ('っちゃ', 'ccha', 'sokuon_yoon', 141, 'sokuon', 'example', 'native', 'core', null),
  ('っちゅ', 'cchu', 'sokuon_yoon', 142, 'sokuon', 'example', 'native', 'core', null),
  ('っちょ', 'ccho', 'sokuon_yoon', 143, 'sokuon', 'example', 'native', 'core', null),
  ('っぴゃ', 'ppya', 'sokuon_yoon', 144, 'sokuon', 'example', 'native', 'core', null),
  ('っぴゅ', 'ppyu', 'sokuon_yoon', 145, 'sokuon', 'example', 'native', 'core', null),
  ('っぴょ', 'ppyo', 'sokuon_yoon', 146, 'sokuon', 'example', 'native', 'core', null),

  ('ん', 'n-gemination', 'n_gemination_rule', 147, 'n_gemination', 'rule', 'native', 'core',
    'A different mechanism from sokuon that produces a similar doubled-consonant effect: ん immediately followed by a な-row kana (な/に/ぬ/ね/の) sounds like a doubled n, even though no small つ is involved -- ん itself carries the first half. Examples: みんな (minna, "everyone"), てんない (tennai, "inside the store"), さんねん (sannen, "three years").'),

  ('んな', 'nna', 'n_gemination_example', 148, 'n_gemination', 'example', 'native', 'core', null),
  ('んに', 'nni', 'n_gemination_example', 149, 'n_gemination', 'example', 'native', 'core', null),
  ('んぬ', 'nnu', 'n_gemination_example', 150, 'n_gemination', 'example', 'native', 'core', null),
  ('んね', 'nne', 'n_gemination_example', 151, 'n_gemination', 'example', 'native', 'core', null),
  ('んの', 'nno', 'n_gemination_example', 152, 'n_gemination', 'example', 'native', 'core', null),

  ('連濁', 'rendaku', 'rendaku_rule', 153, 'rendaku', 'rule', 'native', 'core',
    'Rendaku ("sequential voicing"): when two words combine into a compound, the first consonant of the second word often becomes voiced -- か/さ/た/は-row sounds shift to が/ざ/だ/ば. It''s a tendency, not a strict rule -- some compounds voice, some don''t, and it''s largely learned word by word. Example: て (te, "hand") + かみ (kami, "paper") -> てがみ (tegami, "letter").'),

  ('てがみ', 'tegami', 'rendaku_k', 154, 'rendaku', 'example', 'native', 'core', null),
  ('おりがみ', 'origami', 'rendaku_k', 155, 'rendaku', 'example', 'native', 'core', null),
  ('ねがいごと', 'negaigoto', 'rendaku_k', 156, 'rendaku', 'example', 'native', 'core', null),

  ('あおぞら', 'aozora', 'rendaku_s', 157, 'rendaku', 'example', 'native', 'core', null),
  ('てじな', 'tejina', 'rendaku_s', 158, 'rendaku', 'example', 'native', 'core', null),
  ('たにぞこ', 'tanizoko', 'rendaku_s', 159, 'rendaku', 'example', 'native', 'core', null),

  ('みかづき', 'mikazuki', 'rendaku_t', 160, 'rendaku', 'example', 'native', 'core', null),
  ('はなぢ', 'hanaji', 'rendaku_t', 161, 'rendaku', 'example', 'native', 'core', null),
  ('てづくり', 'tezukuri', 'rendaku_t', 162, 'rendaku', 'example', 'native', 'core', null),

  ('はなび', 'hanabi', 'rendaku_h', 163, 'rendaku', 'example', 'native', 'core', null),
  ('たびびと', 'tabibito', 'rendaku_h', 164, 'rendaku', 'example', 'native', 'core', null),
  ('あしぶみ', 'ashibumi', 'rendaku_h', 165, 'rendaku', 'example', 'native', 'core', null),

  ('は', 'wa (topic particle)', 'particle_ha', 166, 'particle_reading', 'rule', 'native', 'core',
    'は is normally read "ha", but when used as the topic-marking particle (right after the word or phrase it marks), it''s read "wa" instead. The spelling never changes -- only the reading, and only in this one grammatical role.'),
  ('わたしは', 'watashiwa', 'particle_ha', 167, 'particle_reading', 'example', 'native', 'core', null),
  ('これは', 'korewa', 'particle_ha', 168, 'particle_reading', 'example', 'native', 'core', null),

  ('へ', 'e (direction particle)', 'particle_he', 169, 'particle_reading', 'rule', 'native', 'core',
    'へ is normally read "he", but when used as the direction-marking particle ("to/towards"), it''s read "e" instead. Same idea as は/wa -- the spelling stays へ, only the reading changes, and only in this grammatical role.'),
  ('がっこうへ', 'gakkoue', 'particle_he', 170, 'particle_reading', 'example', 'native', 'core', null),
  ('うちへ', 'uchie', 'particle_he', 171, 'particle_reading', 'example', 'native', 'core', null),

  ('ゐ', 'wi', 'historical_wa', 172, 'historical', 'character', 'native', 'historical', null),
  ('ゑ', 'we', 'historical_wa', 173, 'historical', 'character', 'native', 'historical', null),

  ('ゝ', 'iteration mark', 'iteration_unvoiced', 174, 'historical', 'rule', 'native', 'historical',
    'Repeats the immediately preceding kana without adding voicing -- historically used to avoid writing the same character twice, e.g. こゝろ for こころ (kokoro, "heart"). Rare in modern writing; mostly seen in old texts, some personal names, and stylized branding.'),
  ('こゝろ', 'kokoro', 'iteration_unvoiced', 175, 'historical', 'example', 'native', 'historical', null),

  ('ゞ', 'voiced iteration mark', 'iteration_voiced', 176, 'historical', 'rule', 'native', 'historical',
    'Works like ゝ but adds voicing to the repeated sound -- historically すゞめ was written this way instead of すずめ (suzume, "sparrow").'),
  ('すゞめ', 'suzume', 'iteration_voiced', 177, 'historical', 'example', 'native', 'historical', null);

-- ---------------------------------------------------------------------------
-- Katakana: continues from sort_order 170. Only the script-agnostic pieces apply here --
-- ん-gemination, rendaku, and は/へ particle readings are hiragana-only (see header note).
-- ---------------------------------------------------------------------------
insert into public.katakana
  (character, romaji, gojuon_row, sort_order, kana_type, entry_kind, sound_origin, frequency_tier, notes) values

  ('キャ', 'yoon', 'yoon_rule', 171, 'yoon', 'rule', 'native', 'core',
    'Yōon: a katakana ending in "i" (キ/シ/チ/ニ/ヒ/ミ/リ, or their voiced forms ギ/ジ/ビ/ピ) followed by a small ャ/ュ/ョ -- the two are pronounced together as one connected sound, not two separate syllables. キャ is one mora (kya), not "ki" + "ya".'),

  ('ッキャ', 'kkya', 'sokuon_yoon', 172, 'sokuon', 'example', 'native', 'core', null),
  ('ッキュ', 'kkyu', 'sokuon_yoon', 173, 'sokuon', 'example', 'native', 'core', null),
  ('ッキョ', 'kkyo', 'sokuon_yoon', 174, 'sokuon', 'example', 'native', 'core', null),
  ('ッシャ', 'ssha', 'sokuon_yoon', 175, 'sokuon', 'example', 'native', 'core', null),
  ('ッシュ', 'sshu', 'sokuon_yoon', 176, 'sokuon', 'example', 'native', 'core', null),
  ('ッショ', 'ssho', 'sokuon_yoon', 177, 'sokuon', 'example', 'native', 'core', null),
  ('ッチャ', 'ccha', 'sokuon_yoon', 178, 'sokuon', 'example', 'native', 'core', null),
  ('ッチュ', 'cchu', 'sokuon_yoon', 179, 'sokuon', 'example', 'native', 'core', null),
  ('ッチョ', 'ccho', 'sokuon_yoon', 180, 'sokuon', 'example', 'native', 'core', null),
  ('ッピャ', 'ppya', 'sokuon_yoon', 181, 'sokuon', 'example', 'native', 'core', null),
  ('ッピュ', 'ppyu', 'sokuon_yoon', 182, 'sokuon', 'example', 'native', 'core', null),
  ('ッピョ', 'ppyo', 'sokuon_yoon', 183, 'sokuon', 'example', 'native', 'core', null),

  ('ヰ', 'wi', 'historical_wa', 184, 'historical', 'character', 'native', 'historical', null),
  ('ヱ', 'we', 'historical_wa', 185, 'historical', 'character', 'native', 'historical', null),

  ('ヽ', 'iteration mark', 'iteration_unvoiced', 186, 'historical', 'rule', 'native', 'historical',
    'Katakana''s equivalent of ゝ -- repeats the preceding katakana without adding voicing. Rare even by katakana-iteration standards; occasionally seen in old signage or stylized names, e.g. キヽョウ for キキョウ (kikyou, "bellflower").'),
  ('キヽョウ', 'kikyou', 'iteration_unvoiced', 187, 'historical', 'example', 'native', 'historical', null),

  ('ヾ', 'voiced iteration mark', 'iteration_voiced', 188, 'historical', 'rule', 'native', 'historical',
    'Katakana''s voiced iteration mark -- pairs with ヽ the way ゞ pairs with ゝ in hiragana. Extremely rare in any era of Japanese writing; included here for completeness rather than because it appears in real text you''re likely to encounter.');
