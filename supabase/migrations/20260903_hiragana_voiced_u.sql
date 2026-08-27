-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- ゔ (う + dakuten) -- hiragana's rare counterpart to katakana ヴ, used occasionally to write the
-- "vu" sound within otherwise-hiragana text. Continues sort_order from 177
-- (20260903_kana_orthography_rules_expansion.sql).

insert into public.hiragana
  (character, romaji, gojuon_row, sort_order, kana_type, entry_kind, sound_origin, frequency_tier, notes) values
  ('ゔ', 'vu', 'historical_va', 178, 'historical', 'character', 'native', 'historical',
    'う + dakuten, used occasionally to write the "vu" sound in hiragana -- the hiragana counterpart to katakana ヴ. Very rare; most Japanese text uses katakana ヴ for this sound even within an otherwise-hiragana word.');
