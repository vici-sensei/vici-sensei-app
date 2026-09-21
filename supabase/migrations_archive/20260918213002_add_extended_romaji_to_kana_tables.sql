-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Adds public.hiragana.extended_romaji and public.katakana.extended_romaji (text[], NOT NULL,
-- default '{}'): extra spellings that should count as correct when a student types the romaji
-- of a kana, in addition to the single canonical `romaji` value. Both tables are filled by the
-- same rule, from romaji-tables.tsv (the file Cezara maintains):
--
--   extended_romaji = every value in the Hepburn, Kunrei, Nihon, BGN/PCGN, "Alte variante uzuale"
--   and the four keyboard columns (Google/Mozc + Microsoft IME, direct and composed sequences)
--   of the row whose kana equals `character`, deduplicated within the row.
--
-- Notes on the data:
--   * Values are stored exactly as written in the file, including `'` and `-` (n', t'i, o-, ...).
--     The app strips every non-letter before comparing, so these behave as their letters-only form.
--   * `romaji` itself usually appears in its own extended_romaji (the Hepburn column mostly equals
--     it). That duplication is intentional.
--   * Composed IME sequences (ltuci, xtsuchi, cixya, kilya, ...) are kept on purpose; they are
--     more than half of all values.
--   * Rows are matched on (character, romaji), which is unique in both tables.
--
-- Rows left at '{}' (nothing in the file to base them on, or nothing to add):
--   * every entry_kind = 'rule' row (6 in hiragana, 8 in katakana);
--   * hiragana n_gemination examples: んな んに んぬ んね んの;
--   * katakana n_gemination examples: ンナ ンニ ンヌ ンネ ンノ;
--   * katakana choonpu examples カー キー ... ワー (39 rows, sort_order 146-184; アー イー ウー エー
--     オー are covered by the file and are filled).
--   These are meant to be revisited after typing tests to find out which spellings are worth adding.
--
-- The file's BGN/PCGN cell for イー reads "ī (tabelul 3) / ii (nota 5)"; it is stored as ī and ii.
-- The DO blocks abort the whole statement if the number of updated rows is not the expected one.

alter table public.hiragana add column if not exists extended_romaji text[] not null default '{}';

comment on column public.hiragana.extended_romaji is 'Extra accepted spellings for this row, on top of romaji: Hepburn, Kunrei, Nihon, BGN/PCGN, common variants and IME key sequences, stored as written in romaji-tables.tsv. Empty array when no extra spelling is known yet.';

do $$
declare
  n integer;
begin
  update public.hiragana t
  set extended_romaji = v.vals
  from (values
    ('あ', 'a', array['a']),
    ('い', 'i', array['i']),
    ('う', 'u', array['u', 'wu', 'whu']),
    ('え', 'e', array['e']),
    ('お', 'o', array['o']),
    ('か', 'ka', array['ka', 'ca']),
    ('き', 'ki', array['ki']),
    ('く', 'ku', array['ku', 'cu', 'qu']),
    ('け', 'ke', array['ke']),
    ('こ', 'ko', array['ko', 'co']),
    ('さ', 'sa', array['sa']),
    ('し', 'shi', array['shi', 'si', 'ci']),
    ('す', 'su', array['su']),
    ('せ', 'se', array['se', 'ce']),
    ('そ', 'so', array['so']),
    ('た', 'ta', array['ta']),
    ('ち', 'chi', array['chi', 'ti']),
    ('つ', 'tsu', array['tsu', 'tu']),
    ('て', 'te', array['te']),
    ('と', 'to', array['to']),
    ('な', 'na', array['na']),
    ('に', 'ni', array['ni']),
    ('ぬ', 'nu', array['nu']),
    ('ね', 'ne', array['ne']),
    ('の', 'no', array['no']),
    ('は', 'ha', array['ha']),
    ('ひ', 'hi', array['hi']),
    ('ふ', 'fu', array['fu', 'hu']),
    ('へ', 'he', array['he']),
    ('ほ', 'ho', array['ho']),
    ('ま', 'ma', array['ma']),
    ('み', 'mi', array['mi']),
    ('む', 'mu', array['mu']),
    ('め', 'me', array['me']),
    ('も', 'mo', array['mo']),
    ('や', 'ya', array['ya']),
    ('ゆ', 'yu', array['yu']),
    ('よ', 'yo', array['yo']),
    ('ら', 'ra', array['ra']),
    ('り', 'ri', array['ri']),
    ('る', 'ru', array['ru']),
    ('れ', 're', array['re']),
    ('ろ', 'ro', array['ro']),
    ('わ', 'wa', array['wa']),
    ('を', 'wo', array['o', 'wo']),
    ('ん', 'n', array['n', 'n''', 'nn', 'xn']),
    ('が', 'ga', array['ga']),
    ('ぎ', 'gi', array['gi']),
    ('ぐ', 'gu', array['gu']),
    ('げ', 'ge', array['ge']),
    ('ご', 'go', array['go']),
    ('ざ', 'za', array['za']),
    ('じ', 'ji', array['ji', 'zi']),
    ('ず', 'zu', array['zu']),
    ('ぜ', 'ze', array['ze']),
    ('ぞ', 'zo', array['zo']),
    ('だ', 'da', array['da']),
    ('ぢ', 'ji', array['ji', 'zi', 'di']),
    ('づ', 'zu', array['zu', 'du']),
    ('で', 'de', array['de']),
    ('ど', 'do', array['do']),
    ('ば', 'ba', array['ba']),
    ('び', 'bi', array['bi']),
    ('ぶ', 'bu', array['bu']),
    ('べ', 'be', array['be']),
    ('ぼ', 'bo', array['bo']),
    ('ぱ', 'pa', array['pa']),
    ('ぴ', 'pi', array['pi']),
    ('ぷ', 'pu', array['pu']),
    ('ぺ', 'pe', array['pe']),
    ('ぽ', 'po', array['po']),
    ('きゃ', 'kya', array['kya', 'kilya', 'kixya']),
    ('きゅ', 'kyu', array['kyu', 'kilyu', 'kixyu']),
    ('きょ', 'kyo', array['kyo', 'kilyo', 'kixyo']),
    ('しゃ', 'sha', array['sha', 'sya', 'cilya', 'cixya', 'silya', 'sixya', 'shilya', 'shixya']),
    ('しゅ', 'shu', array['shu', 'syu', 'cilyu', 'cixyu', 'silyu', 'sixyu', 'shilyu', 'shixyu']),
    ('しょ', 'sho', array['sho', 'syo', 'cilyo', 'cixyo', 'silyo', 'sixyo', 'shilyo', 'shixyo']),
    ('ちゃ', 'cha', array['cha', 'tya', 'cya', 'tilya', 'tixya', 'chilya', 'chixya']),
    ('ちゅ', 'chu', array['chu', 'tyu', 'cyu', 'tilyu', 'tixyu', 'chilyu', 'chixyu']),
    ('ちょ', 'cho', array['cho', 'tyo', 'cyo', 'tilyo', 'tixyo', 'chilyo', 'chixyo']),
    ('にゃ', 'nya', array['nya', 'nilya', 'nixya']),
    ('にゅ', 'nyu', array['nyu', 'nilyu', 'nixyu']),
    ('にょ', 'nyo', array['nyo', 'nilyo', 'nixyo']),
    ('ひゃ', 'hya', array['hya', 'hilya', 'hixya']),
    ('ひゅ', 'hyu', array['hyu', 'hilyu', 'hixyu']),
    ('ひょ', 'hyo', array['hyo', 'hilyo', 'hixyo']),
    ('みゃ', 'mya', array['mya', 'milya', 'mixya']),
    ('みゅ', 'myu', array['myu', 'milyu', 'mixyu']),
    ('みょ', 'myo', array['myo', 'milyo', 'mixyo']),
    ('りゃ', 'rya', array['rya', 'rilya', 'rixya']),
    ('りゅ', 'ryu', array['ryu', 'rilyu', 'rixyu']),
    ('りょ', 'ryo', array['ryo', 'rilyo', 'rixyo']),
    ('ぎゃ', 'gya', array['gya', 'gilya', 'gixya']),
    ('ぎゅ', 'gyu', array['gyu', 'gilyu', 'gixyu']),
    ('ぎょ', 'gyo', array['gyo', 'gilyo', 'gixyo']),
    ('じゃ', 'ja', array['ja', 'zya', 'jya', 'jilya', 'jixya', 'zilya', 'zixya']),
    ('じゅ', 'ju', array['ju', 'zyu', 'jyu', 'jilyu', 'jixyu', 'zilyu', 'zixyu']),
    ('じょ', 'jo', array['jo', 'zyo', 'jyo', 'jilyo', 'jixyo', 'zilyo', 'zixyo']),
    ('びゃ', 'bya', array['bya', 'bilya', 'bixya']),
    ('びゅ', 'byu', array['byu', 'bilyu', 'bixyu']),
    ('びょ', 'byo', array['byo', 'bilyo', 'bixyo']),
    ('ぴゃ', 'pya', array['pya', 'pilya', 'pixya']),
    ('ぴゅ', 'pyu', array['pyu', 'pilyu', 'pixyu']),
    ('ぴょ', 'pyo', array['pyo', 'pilyo', 'pixyo']),
    ('っか', 'kka', array['kka', 'cca', 'ltuca', 'ltuka', 'xtuca', 'xtuka', 'ltsuca', 'ltsuka', 'xtsuca', 'xtsuka']),
    ('っき', 'kki', array['kki', 'ltuki', 'xtuki', 'ltsuki', 'xtsuki']),
    ('っく', 'kku', array['kku', 'ccu', 'qqu', 'ltucu', 'ltuku', 'ltuqu', 'xtucu', 'xtuku', 'xtuqu', 'ltsucu', 'ltsuku', 'ltsuqu', 'xtsucu', 'xtsuku', 'xtsuqu']),
    ('っけ', 'kke', array['kke', 'ltuke', 'xtuke', 'ltsuke', 'xtsuke']),
    ('っこ', 'kko', array['kko', 'cco', 'ltuco', 'ltuko', 'xtuco', 'xtuko', 'ltsuco', 'ltsuko', 'xtsuco', 'xtsuko']),
    ('っさ', 'ssa', array['ssa', 'ltusa', 'xtusa', 'ltsusa', 'xtsusa']),
    ('っし', 'sshi', array['sshi', 'ssi', 'cci', 'ltuci', 'ltusi', 'xtuci', 'xtusi', 'ltsuci', 'ltsusi', 'ltushi', 'xtsuci', 'xtsusi', 'xtushi', 'ltsushi', 'xtsushi']),
    ('っす', 'ssu', array['ssu', 'ltusu', 'xtusu', 'ltsusu', 'xtsusu']),
    ('っせ', 'sse', array['sse', 'cce', 'ltuce', 'ltuse', 'xtuce', 'xtuse', 'ltsuce', 'ltsuse', 'xtsuce', 'xtsuse']),
    ('っそ', 'sso', array['sso', 'ltuso', 'xtuso', 'ltsuso', 'xtsuso']),
    ('った', 'tta', array['tta', 'ltuta', 'xtuta', 'ltsuta', 'xtsuta']),
    ('っち', 'cchi', array['tchi', 'tti', 'cchi', 'ltuti', 'xtuti', 'ltsuti', 'ltuchi', 'xtsuti', 'xtuchi', 'ltsuchi', 'xtsuchi']),
    ('っつ', 'ttsu', array['ttsu', 'ttu', 'ltutu', 'xtutu', 'ltsutu', 'ltutsu', 'xtsutu', 'xtutsu', 'ltsutsu', 'xtsutsu']),
    ('って', 'tte', array['tte', 'ltute', 'xtute', 'ltsute', 'xtsute']),
    ('っと', 'tto', array['tto', 'ltuto', 'xtuto', 'ltsuto', 'xtsuto']),
    ('っぱ', 'ppa', array['ppa', 'ltupa', 'xtupa', 'ltsupa', 'xtsupa']),
    ('っぴ', 'ppi', array['ppi', 'ltupi', 'xtupi', 'ltsupi', 'xtsupi']),
    ('っぷ', 'ppu', array['ppu', 'ltupu', 'xtupu', 'ltsupu', 'xtsupu']),
    ('っぺ', 'ppe', array['ppe', 'ltupe', 'xtupe', 'ltsupe', 'xtsupe']),
    ('っぽ', 'ppo', array['ppo', 'ltupo', 'xtupo', 'ltsupo', 'xtsupo'])
  ) as v(character, romaji, vals)
  where t.character = v.character
    and t.romaji = v.romaji;

  get diagnostics n = row_count;
  if n <> 124 then
    raise exception 'extended_romaji: expected 124 hiragana rows updated, got %', n;
  end if;
end $$;

alter table public.katakana add column if not exists extended_romaji text[] not null default '{}';

comment on column public.katakana.extended_romaji is 'Extra accepted spellings for this row, on top of romaji: Hepburn, Kunrei, Nihon, BGN/PCGN, common variants and IME key sequences, stored as written in romaji-tables.tsv. Empty array when no extra spelling is known yet.';

do $$
declare
  n integer;
begin
  update public.katakana t
  set extended_romaji = v.vals
  from (values
    ('ア', 'a', array['a']),
    ('イ', 'i', array['i']),
    ('ウ', 'u', array['u', 'wu', 'whu']),
    ('エ', 'e', array['e']),
    ('オ', 'o', array['o']),
    ('カ', 'ka', array['ka', 'ca']),
    ('キ', 'ki', array['ki']),
    ('ク', 'ku', array['ku', 'cu', 'qu']),
    ('ケ', 'ke', array['ke']),
    ('コ', 'ko', array['ko', 'co']),
    ('サ', 'sa', array['sa']),
    ('シ', 'shi', array['shi', 'si', 'ci']),
    ('ス', 'su', array['su']),
    ('セ', 'se', array['se', 'ce']),
    ('ソ', 'so', array['so']),
    ('タ', 'ta', array['ta']),
    ('チ', 'chi', array['chi', 'ti']),
    ('ツ', 'tsu', array['tsu', 'tu']),
    ('テ', 'te', array['te']),
    ('ト', 'to', array['to']),
    ('ナ', 'na', array['na']),
    ('ニ', 'ni', array['ni']),
    ('ヌ', 'nu', array['nu']),
    ('ネ', 'ne', array['ne']),
    ('ノ', 'no', array['no']),
    ('ハ', 'ha', array['ha']),
    ('ヒ', 'hi', array['hi']),
    ('フ', 'fu', array['fu', 'hu']),
    ('ヘ', 'he', array['he']),
    ('ホ', 'ho', array['ho']),
    ('マ', 'ma', array['ma']),
    ('ミ', 'mi', array['mi']),
    ('ム', 'mu', array['mu']),
    ('メ', 'me', array['me']),
    ('モ', 'mo', array['mo']),
    ('ヤ', 'ya', array['ya']),
    ('ユ', 'yu', array['yu']),
    ('ヨ', 'yo', array['yo']),
    ('ラ', 'ra', array['ra']),
    ('リ', 'ri', array['ri']),
    ('ル', 'ru', array['ru']),
    ('レ', 're', array['re']),
    ('ロ', 'ro', array['ro']),
    ('ワ', 'wa', array['wa']),
    ('ン', 'n', array['n', 'n''', 'nn', 'xn']),
    ('ガ', 'ga', array['ga']),
    ('ギ', 'gi', array['gi']),
    ('グ', 'gu', array['gu']),
    ('ゲ', 'ge', array['ge']),
    ('ゴ', 'go', array['go']),
    ('ザ', 'za', array['za']),
    ('ジ', 'ji', array['ji', 'zi']),
    ('ズ', 'zu', array['zu']),
    ('ゼ', 'ze', array['ze']),
    ('ゾ', 'zo', array['zo']),
    ('ダ', 'da', array['da']),
    ('ヂ', 'ji', array['ji', 'zi', 'di']),
    ('ヅ', 'zu', array['zu', 'du']),
    ('デ', 'de', array['de']),
    ('ド', 'do', array['do']),
    ('バ', 'ba', array['ba']),
    ('ビ', 'bi', array['bi']),
    ('ブ', 'bu', array['bu']),
    ('ベ', 'be', array['be']),
    ('ボ', 'bo', array['bo']),
    ('パ', 'pa', array['pa']),
    ('ピ', 'pi', array['pi']),
    ('プ', 'pu', array['pu']),
    ('ペ', 'pe', array['pe']),
    ('ポ', 'po', array['po']),
    ('キャ', 'kya', array['kya', 'kilya', 'kixya']),
    ('キュ', 'kyu', array['kyu', 'kilyu', 'kixyu']),
    ('キョ', 'kyo', array['kyo', 'kilyo', 'kixyo']),
    ('シャ', 'sha', array['sha', 'sya', 'cilya', 'cixya', 'silya', 'sixya', 'shilya', 'shixya']),
    ('シュ', 'shu', array['shu', 'syu', 'cilyu', 'cixyu', 'silyu', 'sixyu', 'shilyu', 'shixyu']),
    ('ショ', 'sho', array['sho', 'syo', 'cilyo', 'cixyo', 'silyo', 'sixyo', 'shilyo', 'shixyo']),
    ('チャ', 'cha', array['cha', 'tya', 'cya', 'tilya', 'tixya', 'chilya', 'chixya']),
    ('チュ', 'chu', array['chu', 'tyu', 'cyu', 'tilyu', 'tixyu', 'chilyu', 'chixyu']),
    ('チョ', 'cho', array['cho', 'tyo', 'cyo', 'tilyo', 'tixyo', 'chilyo', 'chixyo']),
    ('ニャ', 'nya', array['nya', 'nilya', 'nixya']),
    ('ニュ', 'nyu', array['nyu', 'nilyu', 'nixyu']),
    ('ニョ', 'nyo', array['nyo', 'nilyo', 'nixyo']),
    ('ヒャ', 'hya', array['hya', 'hilya', 'hixya']),
    ('ヒュ', 'hyu', array['hyu', 'hilyu', 'hixyu']),
    ('ヒョ', 'hyo', array['hyo', 'hilyo', 'hixyo']),
    ('ミャ', 'mya', array['mya', 'milya', 'mixya']),
    ('ミュ', 'myu', array['myu', 'milyu', 'mixyu']),
    ('ミョ', 'myo', array['myo', 'milyo', 'mixyo']),
    ('リャ', 'rya', array['rya', 'rilya', 'rixya']),
    ('リュ', 'ryu', array['ryu', 'rilyu', 'rixyu']),
    ('リョ', 'ryo', array['ryo', 'rilyo', 'rixyo']),
    ('ギャ', 'gya', array['gya', 'gilya', 'gixya']),
    ('ギュ', 'gyu', array['gyu', 'gilyu', 'gixyu']),
    ('ギョ', 'gyo', array['gyo', 'gilyo', 'gixyo']),
    ('ジャ', 'ja', array['ja', 'zya', 'jya', 'jilya', 'jixya', 'zilya', 'zixya']),
    ('ジュ', 'ju', array['ju', 'zyu', 'jyu', 'jilyu', 'jixyu', 'zilyu', 'zixyu']),
    ('ジョ', 'jo', array['jo', 'zyo', 'jyo', 'jilyo', 'jixyo', 'zilyo', 'zixyo']),
    ('ビャ', 'bya', array['bya', 'bilya', 'bixya']),
    ('ビュ', 'byu', array['byu', 'bilyu', 'bixyu']),
    ('ビョ', 'byo', array['byo', 'bilyo', 'bixyo']),
    ('ピャ', 'pya', array['pya', 'pilya', 'pixya']),
    ('ピュ', 'pyu', array['pyu', 'pilyu', 'pixyu']),
    ('ピョ', 'pyo', array['pyo', 'pilyo', 'pixyo']),
    ('ッカ', 'kka', array['kka', 'cca', 'ltuca', 'ltuka', 'xtuca', 'xtuka', 'ltsuca', 'ltsuka', 'xtsuca', 'xtsuka']),
    ('ッキ', 'kki', array['kki', 'ltuki', 'xtuki', 'ltsuki', 'xtsuki']),
    ('ック', 'kku', array['kku', 'ccu', 'qqu', 'ltucu', 'ltuku', 'ltuqu', 'xtucu', 'xtuku', 'xtuqu', 'ltsucu', 'ltsuku', 'ltsuqu', 'xtsucu', 'xtsuku', 'xtsuqu']),
    ('ッケ', 'kke', array['kke', 'ltuke', 'xtuke', 'ltsuke', 'xtsuke']),
    ('ッコ', 'kko', array['kko', 'cco', 'ltuco', 'ltuko', 'xtuco', 'xtuko', 'ltsuco', 'ltsuko', 'xtsuco', 'xtsuko']),
    ('ッサ', 'ssa', array['ssa', 'ltusa', 'xtusa', 'ltsusa', 'xtsusa']),
    ('ッシ', 'sshi', array['sshi', 'ssi', 'cci', 'ltuci', 'ltusi', 'xtuci', 'xtusi', 'ltsuci', 'ltsusi', 'ltushi', 'xtsuci', 'xtsusi', 'xtushi', 'ltsushi', 'xtsushi']),
    ('ッス', 'ssu', array['ssu', 'ltusu', 'xtusu', 'ltsusu', 'xtsusu']),
    ('ッセ', 'sse', array['sse', 'cce', 'ltuce', 'ltuse', 'xtuce', 'xtuse', 'ltsuce', 'ltsuse', 'xtsuce', 'xtsuse']),
    ('ッソ', 'sso', array['sso', 'ltuso', 'xtuso', 'ltsuso', 'xtsuso']),
    ('ッタ', 'tta', array['tta', 'ltuta', 'xtuta', 'ltsuta', 'xtsuta']),
    ('ッチ', 'cchi', array['tchi', 'tti', 'cchi', 'ltuti', 'xtuti', 'ltsuti', 'ltuchi', 'xtsuti', 'xtuchi', 'ltsuchi', 'xtsuchi']),
    ('ッツ', 'ttsu', array['ttsu', 'ttu', 'ltutu', 'xtutu', 'ltsutu', 'ltutsu', 'xtsutu', 'xtutsu', 'ltsutsu', 'xtsutsu']),
    ('ッテ', 'tte', array['tte', 'ltute', 'xtute', 'ltsute', 'xtsute']),
    ('ット', 'tto', array['tto', 'ltuto', 'xtuto', 'ltsuto', 'xtsuto']),
    ('ッパ', 'ppa', array['ppa', 'ltupa', 'xtupa', 'ltsupa', 'xtsupa']),
    ('ッピ', 'ppi', array['ppi', 'ltupi', 'xtupi', 'ltsupi', 'xtsupi']),
    ('ップ', 'ppu', array['ppu', 'ltupu', 'xtupu', 'ltsupu', 'xtsupu']),
    ('ッペ', 'ppe', array['ppe', 'ltupe', 'xtupe', 'ltsupe', 'xtsupe']),
    ('ッポ', 'ppo', array['ppo', 'ltupo', 'xtupo', 'ltsupo', 'xtsupo']),
    ('ッグ', 'ggu', array['ggu', 'ltugu', 'xtugu', 'ltsugu', 'xtsugu']),
    ('ッズ', 'zzu', array['zzu', 'ltuzu', 'xtuzu', 'ltsuzu', 'xtsuzu']),
    ('ッド', 'ddo', array['ddo', 'ltudo', 'xtudo', 'ltsudo', 'xtsudo']),
    ('ッジ', 'jji', array['jji', 'zzi', 'ltuji', 'ltuzi', 'xtuji', 'xtuzi', 'ltsuji', 'ltsuzi', 'xtsuji', 'xtsuzi']),
    ('ッブ', 'bbu', array['bbu', 'ltubu', 'xtubu', 'ltsubu', 'xtsubu']),
    ('アー', 'aa', array['ā', 'â', 'aa', 'a', 'a-']),
    ('イー', 'ii', array['ii', 'î', 'i-', 'ī']),
    ('ウー', 'uu', array['ū', 'û', 'uu', 'u', 'u-', 'uwu', 'wu-', 'wuu', 'uwhu', 'whu-', 'whuu', 'wuwu', 'whuwu', 'wuwhu', 'whuwhu']),
    ('エー', 'ee', array['ee', 'ê', 'ē', 'e', 'e-']),
    ('オー', 'oo', array['ō', 'ô', 'ou', 'oo', 'oh', 'o', 'o-', 'owu', 'owhu']),
    ('ヴァ', 'va', array['va', 'ba', 'vula', 'vuxa']),
    ('ヴィ', 'vi', array['vi', 'bi', 'vyi', 'vuli', 'vuxi', 'vulyi', 'vuxyi']),
    ('ヴ', 'vu', array['vu', 'v', 'bu']),
    ('ヴェ', 've', array['ve', 'be', 'vye', 'vule', 'vuxe', 'vulye', 'vuxye']),
    ('ヴォ', 'vo', array['vo', 'bo', 'vulo', 'vuxo']),
    ('シェ', 'she', array['she', 'sye', 'shie', 'cile', 'cixe', 'sile', 'sixe', 'cilye', 'cixye', 'shile', 'shixe', 'silye', 'sixye', 'shilye', 'shixye']),
    ('ジェ', 'je', array['je', 'zye', 'jie', 'jye', 'jile', 'jixe', 'zile', 'zixe', 'jilye', 'jixye', 'zilye', 'zixye']),
    ('チェ', 'che', array['che', 'tye', 'chie', 'cye', 'tile', 'tixe', 'chile', 'chixe', 'tilye', 'tixye', 'chilye', 'chixye']),
    ('ティ', 'ti', array['ti', 'tei', 't''i', 'thi', 'teli', 'texi', 'telyi', 'texyi']),
    ('トゥ', 'tu', array['tu', 'tou', 't''u', 'twu', 'tolu', 'toxu']),
    ('ディ', 'di', array['di', 'dei', 'd''i', 'dhi', 'deli', 'dexi', 'delyi', 'dexyi']),
    ('ドゥ', 'du', array['du', 'dou', 'd''u', 'dwu', 'dolu', 'doxu']),
    ('ファ', 'fa', array['fa', 'hwa', 'fula', 'fuxa', 'hula', 'huxa', 'fwa']),
    ('フィ', 'fi', array['fi', 'hwi', 'fuli', 'fuxi', 'huli', 'huxi', 'fulyi', 'fuxyi', 'hulyi', 'huxyi']),
    ('フェ', 'fe', array['fe', 'hwe', 'fule', 'fuxe', 'hule', 'huxe', 'fulye', 'fuxye', 'hulye', 'huxye']),
    ('フォ', 'fo', array['fo', 'hwo', 'fulo', 'fuxo', 'hulo', 'huxo']),
    ('ウィ', 'wi', array['wi', 'ui', 'whi', 'uli', 'uxi', 'ulyi', 'uxyi', 'wuli', 'wuxi', 'whuli', 'whuxi', 'wulyi', 'wuxyi', 'whulyi', 'whuxyi']),
    ('ウェ', 'we', array['we', 'ue', 'whe', 'ule', 'uxe', 'ulye', 'uxye', 'wule', 'wuxe', 'whule', 'whuxe', 'wulye', 'wuxye', 'whulye', 'whuxye']),
    ('ウォ', 'wo', array['wo', 'uo', 'who', 'ulo', 'uxo', 'wulo', 'wuxo', 'whulo', 'whuxo'])
  ) as v(character, romaji, vals)
  where t.character = v.character
    and t.romaji = v.romaji;

  get diagnostics n = row_count;
  if n <> 152 then
    raise exception 'extended_romaji: expected 152 katakana rows updated, got %', n;
  end if;
end $$;
