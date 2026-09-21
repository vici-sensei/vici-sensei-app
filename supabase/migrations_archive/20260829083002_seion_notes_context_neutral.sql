-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- The seion rule's notes (hiragana + katakana) ended with "Below, you'll find the full list of
-- .../ each one shown with its pronunciation." -- true on /browse (the gojuon grid really is
-- rendered right below the rule card there), but no longer true on /study's "New rule" intro
-- card: get_new_hiragana_rule_candidates/get_new_katakana_rule_candidates now only ever populate
-- `examples` from entry_kind = 'example' rows (20260905_kana_rule_examples_only.sql), and seion
-- has none -- so the study card renders with an empty (hidden) example grid, directly under a
-- sentence promising one. Per user request, the closing sentence is reworded to a forward
-- reference that holds in both places instead of describing a grid that may or may not follow.

update public.hiragana
set notes = '**Hiragana** is one of the writing systems used for Japanese. Think of it like an alphabet, except each character stands for a whole sound instead of a single letter -- for example, **あ** is pronounced **"ah"**, like the a in "father". It''s usually the very first thing you learn, because it spells native Japanese words and all the little grammar pieces that hold a sentence together.

(Japanese also uses **katakana**, mostly for foreign words, and **kanji** -- symbols borrowed from Chinese that stand for a whole word or idea instead of just a sound.)

You''ll learn each hiragana character next, one at a time, along with its pronunciation.'
where entry_kind = 'rule' and kana_type = 'seion';

update public.katakana
set notes = '**Katakana** is Japanese''s other phonetic writing system, and it works just like hiragana -- each character stands for a whole sound rather than a single letter. For example, **ア** is pronounced **"ah"**, the exact same sound as hiragana''s あ, just written with a different shape.

Japan mainly uses katakana for words borrowed from other languages -- like コーヒー ("kōhī", from "coffee") -- along with foreign names and sound effects.

You''ll learn each katakana character next, one at a time, along with its pronunciation.'
where entry_kind = 'rule' and kana_type = 'seion';
