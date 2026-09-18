-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Fills extended_romaji for the rows 20261226_add_extended_romaji_to_kana_tables.sql left at '{}'
-- because romaji-tables.tsv had nothing to base them on -- using only key sequences confirmed by
-- a real typing test: real key events (SendInput) typed into a text box with the Japanese
-- Microsoft IME in hiragana mode (katakana rows: F7 after typing), the output compared with the
-- target kana. The harness was first calibrated on 16 results already documented for Microsoft
-- IME in romaji-tables.md (all reproduced). The DB romaji itself is NOT a key sequence for these
-- rows (control: nna -> んあ, kaa -> かあ, not かー), which is why they were empty.
--
--   * hiragana n_gemination examples (んな んに んぬ んね んの) and katakana n_gemination examples
--     (ンナ ンニ ンヌ ンネ ンノ): nnn<v>, n'n<v>, xnn<v> (nn / n' / xn = ん, then n<v>).
--   * katakana choonpu examples (カー キー ... ワー, 39 rows): every direct key of the base kana
--     followed by "-" (ー): ka-, ca-, ku-, cu-, qu-, shi-, si-, ci-, ...
--
-- Values are stored raw. The app strips every non-letter before comparing, so n'na behaves as
-- nna (= the row's romaji) and ka- behaves as ka: with "Extended romaji" on, カー accepts ka/ca
-- in addition to kaa.
--
-- Google/Mozc: no live typing test was possible -- Google Japanese Input is not installable any
-- more (its official installer reports "No update is available"). Instead, all 128 tested
-- sequences were run through a simulation of Mozc's preedit conversion using the real upstream
-- table (google/mozc, src/data/preedit/romanji-hiragana.tsv, 322 rules): all 79 candidates give
-- the target kana and all 49 controls do not, identical to Microsoft IME. This is a model of the
-- table, not a test of the IME itself.
--
-- Only rows still at '{}' are touched, and each DO block aborts if the number of updated rows is
-- not the expected one. All entry_kind = 'rule' rows stay '{}' by design.

do $$
declare
  n integer;
begin
  update public.hiragana t
  set extended_romaji = v.vals
  from (values
    ('んな', 'nna', array['nnna', 'n''na', 'xnna']),
    ('んに', 'nni', array['nnni', 'n''ni', 'xnni']),
    ('んぬ', 'nnu', array['nnnu', 'n''nu', 'xnnu']),
    ('んね', 'nne', array['nnne', 'n''ne', 'xnne']),
    ('んの', 'nno', array['nnno', 'n''no', 'xnno'])
  ) as v(character, romaji, vals)
  where t.character = v.character
    and t.romaji = v.romaji
    and t.extended_romaji = '{}';

  get diagnostics n = row_count;
  if n <> 5 then
    raise exception 'extended_romaji fill: expected 5 hiragana rows updated, got %', n;
  end if;
end $$;

do $$
declare
  n integer;
begin
  update public.katakana t
  set extended_romaji = v.vals
  from (values
    ('ンナ', 'nna', array['nnna', 'n''na', 'xnna']),
    ('ンニ', 'nni', array['nnni', 'n''ni', 'xnni']),
    ('ンヌ', 'nnu', array['nnnu', 'n''nu', 'xnnu']),
    ('ンネ', 'nne', array['nnne', 'n''ne', 'xnne']),
    ('ンノ', 'nno', array['nnno', 'n''no', 'xnno']),
    ('カー', 'kaa', array['ca-', 'ka-']),
    ('キー', 'kii', array['ki-']),
    ('クー', 'kuu', array['cu-', 'ku-', 'qu-']),
    ('ケー', 'kee', array['ke-']),
    ('コー', 'koo', array['co-', 'ko-']),
    ('サー', 'saa', array['sa-']),
    ('シー', 'shii', array['ci-', 'si-', 'shi-']),
    ('スー', 'suu', array['su-']),
    ('セー', 'see', array['ce-', 'se-']),
    ('ソー', 'soo', array['so-']),
    ('ター', 'taa', array['ta-']),
    ('チー', 'chii', array['ti-', 'chi-']),
    ('ツー', 'tsuu', array['tu-', 'tsu-']),
    ('テー', 'tee', array['te-']),
    ('トー', 'too', array['to-']),
    ('ナー', 'naa', array['na-']),
    ('ニー', 'nii', array['ni-']),
    ('ヌー', 'nuu', array['nu-']),
    ('ネー', 'nee', array['ne-']),
    ('ノー', 'noo', array['no-']),
    ('ハー', 'haa', array['ha-']),
    ('ヒー', 'hii', array['hi-']),
    ('フー', 'fuu', array['fu-', 'hu-']),
    ('ヘー', 'hee', array['he-']),
    ('ホー', 'hoo', array['ho-']),
    ('マー', 'maa', array['ma-']),
    ('ミー', 'mii', array['mi-']),
    ('ムー', 'muu', array['mu-']),
    ('メー', 'mee', array['me-']),
    ('モー', 'moo', array['mo-']),
    ('ヤー', 'yaa', array['ya-']),
    ('ユー', 'yuu', array['yu-']),
    ('ヨー', 'yoo', array['yo-']),
    ('ラー', 'raa', array['ra-']),
    ('リー', 'rii', array['ri-']),
    ('ルー', 'ruu', array['ru-']),
    ('レー', 'ree', array['re-']),
    ('ロー', 'roo', array['ro-']),
    ('ワー', 'waa', array['wa-'])
  ) as v(character, romaji, vals)
  where t.character = v.character
    and t.romaji = v.romaji
    and t.extended_romaji = '{}';

  get diagnostics n = row_count;
  if n <> 44 then
    raise exception 'extended_romaji fill: expected 44 katakana rows updated, got %', n;
  end if;
end $$;
