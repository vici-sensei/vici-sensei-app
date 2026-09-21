-- Rewrites the seion intro rule notes added in 20260829_kana_seion_intro_rule.sql -- the original
-- text ("core phonetic script", "syllabary", "mora", "gojuon grid") was too jargon-heavy for a
-- student who doesn't know either script yet, and name-dropped kanji without ever explaining what
-- it is. Per user request: simple, friendly, one character + its pronunciation as an example, and
-- kanji explained in passing rather than assumed.

update public.hiragana
set notes = 'Hiragana is one of the writing systems used for Japanese. Think of it like an alphabet, except each character stands for a whole sound instead of a single letter -- for example, あ is pronounced "ah", like the a in "father". It''s usually the very first thing you learn, because it spells native Japanese words and all the little grammar pieces that hold a sentence together. (Japanese also uses katakana, mostly for foreign words, and kanji -- symbols borrowed from Chinese that stand for a whole word or idea instead of just a sound.)'
where gojuon_row = 'seion_rule';

update public.katakana
set notes = 'Katakana is Japanese''s other phonetic writing system, and it works just like hiragana -- each character stands for a whole sound rather than a single letter. For example, ア is pronounced "ah", the exact same sound as hiragana''s あ, just written with a different shape. Japan mainly uses katakana for words borrowed from other languages -- like コーヒー ("kōhī", from "coffee") -- along with foreign names and sound effects.'
where gojuon_row = 'seion_rule';
