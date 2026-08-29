-- Rewrites every rule card's notes in both public.hiragana and public.katakana to be simpler and
-- friendlier -- less jargon (mora, gemination used without explanation), more conversational tone,
-- one concrete example each. Also inserts a literal newline before "Below," in the seion intro
-- rule so it renders as its own line (RuleCard's <p> now has whitespace-pre-line, see
-- BrowseKanaListPage.tsx, so \n actually shows up as a line break).

update public.hiragana
set notes = 'Hiragana is one of the writing systems used for Japanese. Think of it like an alphabet, except each character stands for a whole sound instead of a single letter -- for example, あ is pronounced "ah", like the a in "father". It''s usually the very first thing you learn, because it spells native Japanese words and all the little grammar pieces that hold a sentence together. (Japanese also uses katakana, mostly for foreign words, and kanji -- symbols borrowed from Chinese that stand for a whole word or idea instead of just a sound.)

Below, you''ll find the full list of hiragana characters, each one shown with its pronunciation.'
where gojuon_row = 'seion_rule';

update public.katakana
set notes = 'Katakana is Japanese''s other phonetic writing system, and it works just like hiragana -- each character stands for a whole sound rather than a single letter. For example, ア is pronounced "ah", the exact same sound as hiragana''s あ, just written with a different shape. Japan mainly uses katakana for words borrowed from other languages -- like コーヒー ("kōhī", from "coffee") -- along with foreign names and sound effects.

Below, you''ll find the full list of katakana characters, each one shown with its pronunciation.'
where gojuon_row = 'seion_rule';

update public.hiragana
set notes = 'See those two little marks (゛)? They''re called dakuten, or "ten-ten" for short. Add them to the top-right corner of a か/さ/た/は-row character and it changes to a softer, "buzzier" sound -- か (ka) becomes が (ga), さ (sa) becomes ざ (za), and so on. Same vowel, just a different consonant.'
where gojuon_row = 'dakuten_rule' and character = '゛';

update public.katakana
set notes = 'See those two little marks (゛)? They''re called dakuten, or "ten-ten" for short. Add them to the top-right corner of a カ/サ/タ/ハ-row character and it changes to a softer, "buzzier" sound -- カ (ka) becomes ガ (ga), サ (sa) becomes ザ (za), and so on. Same vowel, just a different consonant.'
where gojuon_row = 'dakuten_rule' and character = '゛';

update public.hiragana
set notes = 'This little circle (゜) is called handakuten, or "maru" for short. It only ever shows up on は-row characters, and it turns them into a crisp "p" sound -- は (ha) becomes ぱ (pa), ひ (hi) becomes ぴ (pi), and so on. は is the only row that ever wears this mark.'
where gojuon_row = 'handakuten_rule' and character = '゜';

update public.katakana
set notes = 'This little circle (゜) is called handakuten, or "maru" for short. It only ever shows up on ハ-row characters, and it turns them into a crisp "p" sound -- ハ (ha) becomes パ (pa), ヒ (hi) becomes ピ (pi), and so on. ハ is the only row that ever wears this mark.'
where gojuon_row = 'handakuten_rule' and character = '゜';

update public.hiragana
set notes = 'When a small ゃ/ゅ/ょ follows a character that ends in an "i" sound (き/し/ち/に/ひ/み/り, or their voiced versions ぎ/じ/び/ぴ), the two get squished together into one quick sound instead of being read separately. So きゃ isn''t "ki" plus "ya" -- it''s just one sound, "kya".'
where gojuon_row = 'yoon_rule' and character = 'きゃ';

update public.katakana
set notes = 'When a small ャ/ュ/ョ follows a character that ends in an "i" sound (キ/シ/チ/ニ/ヒ/ミ/リ, or their voiced versions ギ/ジ/ビ/ピ), the two get squished together into one quick sound instead of being read separately. So キャ isn''t "ki" plus "ya" -- it''s just one sound, "kya".'
where gojuon_row = 'yoon_rule' and character = 'キャ';

update public.hiragana
set notes = 'That small っ doesn''t make any sound on its own -- it just tells you to pause for a beat and double the consonant that comes right after it. For example, がっこう (gakkou, "school") is said like "ga-k-kou", with a tiny stop before the k.'
where gojuon_row = 'sokuon_rule' and character = 'っ';

update public.katakana
set notes = 'That small ッ doesn''t make any sound on its own -- it just tells you to pause for a beat and double the consonant that comes right after it. In katakana you''ll often spot it in loanwords too, even before a "voiced" consonant like b/g/d -- for example, バッグ (baggu, "bag") is said like "ba-g-gu".'
where gojuon_row = 'sokuon_rule' and character = 'ッ';

update public.hiragana
set notes = 'Here''s a similar trick, but without a small っ this time: when ん comes right before a な-row character (な/に/ぬ/ね/の), it sounds like a doubled n -- ん itself does the doubling. You''ll hear this in everyday words like みんな (minna, "everyone") and さんねん (sannen, "three years").'
where gojuon_row = 'n_gemination_rule' and character = 'ん';

update public.katakana
set notes = 'This works the same way in katakana: when ン comes right before a ナ-row character (ナ/ニ/ヌ/ネ/ノ), it sounds like a doubled n, just like hiragana''s ん + な-row. You''ll spot it in loanwords like パンナコッタ (pannakotta, "panna cotta").'
where gojuon_row = 'n_gemination_rule' and character = 'ン';

update public.katakana
set notes = 'That long dash (ー) simply means "stretch this vowel out a little longer." It looks the same no matter which vowel comes before it -- コーヒー (kōhī, "coffee") has two of them. Hiragana doesn''t have a mark like this one; it just repeats the vowel character instead.'
where gojuon_row = 'choonpu_rule' and character = 'ー';

update public.katakana
set notes = 'These combinations were invented to help write foreign sounds that don''t naturally fit into the classic 46 katakana -- a small ァ/ィ/ゥ/ェ/ォ or ュ gets added after a character that wouldn''t normally take one, like ファ (fa), ヴァ (va), or ティ (ti). They became standard back in 1991, specifically to make loanwords easier to read and pronounce.'
where gojuon_row = 'extended_rule' and character = 'ファ';
