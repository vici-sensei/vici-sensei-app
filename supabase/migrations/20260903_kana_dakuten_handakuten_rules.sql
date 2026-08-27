-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Follow-up to 20260903_kana_orthography_rules(_expansion).sql: Browse now renders Dakuten
-- and Handakuten as their own titled subsections instead of folding into the main gojuon
-- grid, and (like every other subsection -- sokuon, chōon, yōon, ...) each gets an explanatory
-- rule row of its own, rendered ahead of its character grid.
--
-- No ALTER needed: kana_type already allows 'dakuten'/'handakuten' and entry_kind already allows
-- 'rule' (20260903_kana_orthography_rules.sql) -- this is a pure data insert, one rule row per
-- table per mark. Continues sort_order from each table's current max (178 hiragana, 188 katakana).
--
-- Like every other rule row, these flow through get_new_hiragana_candidates/
-- get_new_katakana_candidates and introduce_hiragana/introduce_katakana untouched and become
-- ordinary drillable cards -- romaji stays plain ASCII ('dakuten'/'handakuten') to stay typeable
-- against submit_review's exact-match grading.

insert into public.hiragana
  (character, romaji, gojuon_row, sort_order, kana_type, entry_kind, sound_origin, frequency_tier, notes) values
  ('゛', 'dakuten', 'dakuten_rule', 179, 'dakuten', 'rule', 'native', 'core',
    'Dakuten (゛, informally ten-ten): two small strokes added to the upper-right corner of a か/さ/た/は-row kana, shifting its consonant to the voiced counterpart -- か→が, さ→ざ, た→だ, は→ば. Same vowel, different (voiced) consonant.'),
  ('゜', 'handakuten', 'handakuten_rule', 180, 'handakuten', 'rule', 'native', 'core',
    'Handakuten (゜, informally maru): a small circle added to the upper-right corner of a は-row kana only, shifting it to the semi-voiced "p" sound -- は→ぱ, ひ→ぴ, ふ→ぷ, へ→ぺ, ほ→ぽ. は is the only row that takes this mark.');

insert into public.katakana
  (character, romaji, gojuon_row, sort_order, kana_type, entry_kind, sound_origin, frequency_tier, notes) values
  ('゛', 'dakuten', 'dakuten_rule', 189, 'dakuten', 'rule', 'native', 'core',
    'Dakuten (゛, informally ten-ten): two small strokes added to the upper-right corner of a カ/サ/タ/ハ-row kana, shifting its consonant to the voiced counterpart -- カ→ガ, サ→ザ, タ→ダ, ハ→バ. Same vowel, different (voiced) consonant.'),
  ('゜', 'handakuten', 'handakuten_rule', 190, 'handakuten', 'rule', 'native', 'core',
    'Handakuten (゜, informally maru): a small circle added to the upper-right corner of a ハ-row kana only, shifting it to the semi-voiced "p" sound -- ハ→パ, ヒ→ピ, フ→プ, ヘ→ペ, ホ→ポ. ハ is the only row that takes this mark.');
