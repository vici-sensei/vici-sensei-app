-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Katakana's 44 chōonpu examples (アー, イー, ..., ワー -- every base seion character + ー) all
-- shared one flat gojuon_row = 'choonpu_example' tag, so Browse's RuleSubsection could only ever
-- render them as one undifferentiated flat grid. Per user request, they're retagged with the same
-- gojuon_row values the main gojuon chart already uses (a/ka/sa/ta/na/ha/ma/ya/ra/wa) -- these are
-- exactly the rows chōonpu extends, so RuleSubsection's `GOJUON_ROW_LABELS[row] ?? row.toUpperCase()`
-- fallback (BrowseKanaListPage.tsx) already produces the right label (A, KA, SA, ...) with no new
-- label map needed.
--
-- Note: hiragana has no chōonpu rule/examples to retag -- that section was dropped outright in
-- 20260829_drop_hiragana_choonpu_section.sql, well before this migration.

update public.katakana set gojuon_row = 'a'  where id between 191 and 195; -- アー イー ウー エー オー
update public.katakana set gojuon_row = 'ka' where id between 196 and 200; -- カー キー クー ケー コー
update public.katakana set gojuon_row = 'sa' where id between 201 and 205; -- サー シー スー セー ソー
update public.katakana set gojuon_row = 'ta' where id between 206 and 210; -- ター チー ツー テー トー
update public.katakana set gojuon_row = 'na' where id between 211 and 215; -- ナー ニー ヌー ネー ノー
update public.katakana set gojuon_row = 'ha' where id between 216 and 220; -- ハー ヒー フー ヘー ホー
update public.katakana set gojuon_row = 'ma' where id between 221 and 225; -- マー ミー ムー メー モー
update public.katakana set gojuon_row = 'ya' where id between 226 and 228; -- ヤー ユー ヨー
update public.katakana set gojuon_row = 'ra' where id between 229 and 233; -- ラー リー ルー レー ロー
update public.katakana set gojuon_row = 'wa' where id = 234;               -- ワー
