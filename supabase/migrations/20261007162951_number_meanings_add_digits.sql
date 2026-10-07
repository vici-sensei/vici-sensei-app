-- Scope: both live projects (EU-new + US-new), identical text. kanji / vocabulary are reference data,
-- byte-identical on both; the frozen project (hmbemylaqnkiamvhcdcd) does not get it.
--
-- Number kanji and number words: put the digit form next to the spelled-out form in the accepted
-- meanings, so a student can type "7" or "seven" on a meaning card. The meaning cards are typed
-- ("Type a meaning..."), a token is correct if it matches ANY accepted meaning
-- (lib/study/kanjiMeaningMatch.ts), so an extra meaning can only make an answer easier, never harder.
-- Meanings are read live (get_due_cards / get_vocab_meaning_pool), no per-user data holds a copy.
--
-- kanji.meanings (25 kanji):
--   * 零 一-九 十 百 千 and the formal forms 壱 弐 参 拾 伍 陸 漆 玖 (21): the digit is inserted right
--     after the spelled-out number ("one | 1 | one radical (no.1)"); the list had no digit at all.
--   * 万 held "ten thousand | 10 | 000": "10,000" had been split at its comma, so the card accepted
--     "10" (the answer for 十) and "000". Now "ten thousand | 10,000".
--   * 億 / 兆 / 京 stored Python-style exponents ("10**8"); now "10^8" like vocabulary.primary_meanings,
--     plus the full digits a student would actually type ("100,000,000", "1,000,000,000,000",
--     "10,000,000,000,000,000"). 京 also gets the spelled-out "ten quadrillion" (it had only the exponent).
-- vocabulary.primary_meanings (11 + 3 + 1 words):
--   * 七 (しち), 一つ 二つ 三つ 五つ 六つ 七つ 八つ 九つ, 零 (れい), 一 (ひと) had only the spelled-out form
--     (四つ already had "4"): digit inserted after it.
--   * 半 / 分 (ぶ) / 厘: fractions "1/2", "1/10", "1/100" (the matcher drops punctuation, so "1/10"
--     compares as "110"; typed with or without the slash it is the same answer).
--   * 三千: "3000" -> "3,000", the same format as 四千 / 一千 (the comparison ignores commas).
--
-- The companion code change (lib/study/kanjiMeaningMatch.ts splitAnswer) stops a typed "10,000" from
-- being split into "10" and "000"; typing "10000" works even without it.
--
-- Idempotent and guarded: every row must exist exactly once and hold either the old or the new
-- value, anything else aborts the whole migration.

create temp table _kanji_digit (
  kanji text primary key,
  after_meaning text not null,
  extra text not null
);

insert into _kanji_digit (kanji, after_meaning, extra) values
  ('零', 'zero', '0'),
  ('一', 'one', '1'),
  ('二', 'two', '2'),
  ('三', 'three', '3'),
  ('四', 'four', '4'),
  ('五', 'five', '5'),
  ('六', 'six', '6'),
  ('七', 'seven', '7'),
  ('八', 'eight', '8'),
  ('九', 'nine', '9'),
  ('十', 'ten', '10'),
  ('百', 'hundred', '100'),
  ('千', 'thousand', '1,000'),
  ('壱', 'one (in documents)', '1'),
  ('弐', 'two', '2'),
  ('参', 'three (in documents)', '3'),
  ('拾', 'ten', '10'),
  ('伍', 'five', '5'),
  ('陸', 'six', '6'),
  ('漆', 'seven', '7'),
  ('玖', 'nine', '9'),
  ('億', 'hundred million', '100,000,000'),
  ('兆', 'trillion', '1,000,000,000,000'),
  ('京', 'capital', 'ten quadrillion');

create temp table _vocab_digit (
  word text not null,
  kana_reading text not null,
  after_meaning text not null,
  extra text not null,
  primary key (word, kana_reading)
);

insert into _vocab_digit (word, kana_reading, after_meaning, extra) values
  ('七', 'しち', 'seven', '7'),
  ('一つ', 'ひとつ', 'one', '1'),
  ('二つ', 'ふたつ', 'two', '2'),
  ('三つ', 'みっつ', 'three', '3'),
  ('五つ', 'いつつ', 'five', '5'),
  ('六つ', 'むっつ', 'six', '6'),
  ('七つ', 'ななつ', 'seven', '7'),
  ('八つ', 'やっつ', 'eight', '8'),
  ('九つ', 'ここのつ', 'nine', '9'),
  ('零', 'れい', 'zero', '0'),
  ('一', 'ひと', 'one', '1'),
-- fractions
  ('半', 'はん', 'half', '1/2'),
  ('分', 'ぶ', 'one-tenth', '1/10'),
  ('厘', 'りん', 'one-hundredth', '1/100');

do $$
declare
  v_bad text;
begin
  select string_agg(f.kanji, ', ') into v_bad
  from _kanji_digit f
  where (select count(*) from public.kanji k where k.kanji = f.kanji) <> 1
     or not exists (
       select 1 from public.kanji k
       where k.kanji = f.kanji and (f.extra = any(k.meanings) or f.after_meaning = any(k.meanings)));
  if v_bad is not null then
    raise exception 'kanji rows differ from what this migration was written against: %', v_bad;
  end if;

  select string_agg(f.word || '/' || f.kana_reading, ', ') into v_bad
  from _vocab_digit f
  where (select count(*) from public.vocabulary v where v.word = f.word and v.kana_reading = f.kana_reading) <> 1
     or not exists (
       select 1 from public.vocabulary v
       where v.word = f.word and v.kana_reading = f.kana_reading
         and (f.extra = any(v.primary_meanings) or f.after_meaning = any(v.primary_meanings)));
  if v_bad is not null then
    raise exception 'vocabulary rows differ from what this migration was written against: %', v_bad;
  end if;

  -- the four hand-fixed kanji must still be in the shape described above
  select string_agg(k.kanji, ', ') into v_bad
  from public.kanji k
  where (k.kanji = '万' and not (k.meanings @> array['10,000'] or k.meanings @> array['10', '000']))
     or (k.kanji = '億' and not (k.meanings @> array['10^8'] or k.meanings @> array['10**8']))
     or (k.kanji = '兆' and not (k.meanings @> array['10^12'] or k.meanings @> array['10**12']))
     or (k.kanji = '京' and not (k.meanings @> array['10^16'] or k.meanings @> array['10**16']));
  if v_bad is not null then
    raise exception 'kanji rows differ from what this migration was written against: %', v_bad;
  end if;
end $$;

-- 1) digits inserted right after the spelled-out number
update public.kanji k
set meanings = k.meanings[1:array_position(k.meanings, f.after_meaning)] || array[f.extra] || k.meanings[array_position(k.meanings, f.after_meaning) + 1:]
from _kanji_digit f
where k.kanji = f.kanji
  and array_position(k.meanings, f.after_meaning) is not null
  and not (f.extra = any(k.meanings));

update public.vocabulary v
set primary_meanings = v.primary_meanings[1:array_position(v.primary_meanings, f.after_meaning)] || array[f.extra] || v.primary_meanings[array_position(v.primary_meanings, f.after_meaning) + 1:]
from _vocab_digit f
where v.word = f.word
  and v.kana_reading = f.kana_reading
  and array_position(v.primary_meanings, f.after_meaning) is not null
  and not (f.extra = any(v.primary_meanings));

-- 2) 万: "10,000" had been split at the comma
update public.kanji
set meanings = array_remove(array_remove(meanings, '10'), '000') || array['10,000']
where kanji = '万'
  and '000' = any(meanings);

-- 3) exponents: "10**n" -> "10^n"
update public.kanji set meanings = array_replace(meanings, '10**8', '10^8') where kanji = '億' and '10**8' = any(meanings);
update public.kanji set meanings = array_replace(meanings, '10**12', '10^12') where kanji = '兆' and '10**12' = any(meanings);
update public.kanji
set meanings = array_replace(meanings, '10**16', '10^16') || array['10,000,000,000,000,000']
where kanji = '京' and '10**16' = any(meanings);

-- 4) 三千: same thousands format as 四千 / 一千
update public.vocabulary
set primary_meanings = array_replace(primary_meanings, '3000', '3,000')
where word = '三千' and kana_reading = 'さんぜん' and '3000' = any(primary_meanings);

-- every row is now in its final shape
do $$
declare
  v_bad text;
begin
  select string_agg(f.kanji, ', ') into v_bad
  from _kanji_digit f
  where not exists (select 1 from public.kanji k where k.kanji = f.kanji and f.extra = any(k.meanings));
  if v_bad is not null then
    raise exception 'kanji rows not updated: %', v_bad;
  end if;

  select string_agg(f.word || '/' || f.kana_reading, ', ') into v_bad
  from _vocab_digit f
  where not exists (
    select 1 from public.vocabulary v
    where v.word = f.word and v.kana_reading = f.kana_reading and f.extra = any(v.primary_meanings));
  if v_bad is not null then
    raise exception 'vocabulary rows not updated: %', v_bad;
  end if;

  if exists (select 1 from public.kanji where kanji = '万' and ('10' = any(meanings) or '000' = any(meanings)))
     or not exists (select 1 from public.kanji where kanji = '万' and '10,000' = any(meanings)) then
    raise exception '万 meanings not fixed';
  end if;
  if not exists (select 1 from public.kanji where kanji = '京' and '10,000,000,000,000,000' = any(meanings)) then
    raise exception '京 full digits missing';
  end if;
  if exists (select 1 from public.kanji where kanji in ('億', '兆', '京') and array_to_string(meanings, '|') like '%**%') then
    raise exception 'exponents not converted';
  end if;
end $$;

drop table _kanji_digit;
drop table _vocab_digit;
