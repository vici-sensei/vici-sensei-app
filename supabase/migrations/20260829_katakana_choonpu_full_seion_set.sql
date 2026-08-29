-- Expands "Chōonpu" in public.katakana from 5 bare-vowel examples (アー/イー/ウー/エー/オー) to the
-- full 46-character seion row + ー, since the mark can lengthen any katakana mora, not just the
-- five vowels -- per user request. These are mechanical examples (base seion character + ー), not
-- real loanwords, matching how the existing 5 were already built (see romaji: doubled last vowel
-- letter, e.g. カー -> "kaa", not macron "kā"). ンー is included for completeness since ン is part
-- of the 46-character seion set, even though a moraic-nasal + chōonpu isn't a real combination.
--
-- Same renumber-and-cluster approach as the prior kana-ordering migrations: insert the new rows
-- with temporary sort_order values past the current max, then fold the whole table back into a
-- contiguous, section-ordered sequence and re-cluster.

delete from public.katakana where id in (132, 133, 134, 135, 136);

do $$
declare
  base_sort_order integer;
begin
  select coalesce(max(sort_order), 0) into base_sort_order from public.katakana;

  insert into public.katakana (character, romaji, gojuon_row, sort_order, kana_type, entry_kind, sound_origin, frequency_tier, notes)
  values
    ('アー', 'aa', 'choonpu_example', base_sort_order + 1, 'choonpu', 'example', 'native', 'core', null),
    ('イー', 'ii', 'choonpu_example', base_sort_order + 2, 'choonpu', 'example', 'native', 'core', null),
    ('ウー', 'uu', 'choonpu_example', base_sort_order + 3, 'choonpu', 'example', 'native', 'core', null),
    ('エー', 'ee', 'choonpu_example', base_sort_order + 4, 'choonpu', 'example', 'native', 'core', null),
    ('オー', 'oo', 'choonpu_example', base_sort_order + 5, 'choonpu', 'example', 'native', 'core', null),
    ('カー', 'kaa', 'choonpu_example', base_sort_order + 6, 'choonpu', 'example', 'native', 'core', null),
    ('キー', 'kii', 'choonpu_example', base_sort_order + 7, 'choonpu', 'example', 'native', 'core', null),
    ('クー', 'kuu', 'choonpu_example', base_sort_order + 8, 'choonpu', 'example', 'native', 'core', null),
    ('ケー', 'kee', 'choonpu_example', base_sort_order + 9, 'choonpu', 'example', 'native', 'core', null),
    ('コー', 'koo', 'choonpu_example', base_sort_order + 10, 'choonpu', 'example', 'native', 'core', null),
    ('サー', 'saa', 'choonpu_example', base_sort_order + 11, 'choonpu', 'example', 'native', 'core', null),
    ('シー', 'shii', 'choonpu_example', base_sort_order + 12, 'choonpu', 'example', 'native', 'core', null),
    ('スー', 'suu', 'choonpu_example', base_sort_order + 13, 'choonpu', 'example', 'native', 'core', null),
    ('セー', 'see', 'choonpu_example', base_sort_order + 14, 'choonpu', 'example', 'native', 'core', null),
    ('ソー', 'soo', 'choonpu_example', base_sort_order + 15, 'choonpu', 'example', 'native', 'core', null),
    ('ター', 'taa', 'choonpu_example', base_sort_order + 16, 'choonpu', 'example', 'native', 'core', null),
    ('チー', 'chii', 'choonpu_example', base_sort_order + 17, 'choonpu', 'example', 'native', 'core', null),
    ('ツー', 'tsuu', 'choonpu_example', base_sort_order + 18, 'choonpu', 'example', 'native', 'core', null),
    ('テー', 'tee', 'choonpu_example', base_sort_order + 19, 'choonpu', 'example', 'native', 'core', null),
    ('トー', 'too', 'choonpu_example', base_sort_order + 20, 'choonpu', 'example', 'native', 'core', null),
    ('ナー', 'naa', 'choonpu_example', base_sort_order + 21, 'choonpu', 'example', 'native', 'core', null),
    ('ニー', 'nii', 'choonpu_example', base_sort_order + 22, 'choonpu', 'example', 'native', 'core', null),
    ('ヌー', 'nuu', 'choonpu_example', base_sort_order + 23, 'choonpu', 'example', 'native', 'core', null),
    ('ネー', 'nee', 'choonpu_example', base_sort_order + 24, 'choonpu', 'example', 'native', 'core', null),
    ('ノー', 'noo', 'choonpu_example', base_sort_order + 25, 'choonpu', 'example', 'native', 'core', null),
    ('ハー', 'haa', 'choonpu_example', base_sort_order + 26, 'choonpu', 'example', 'native', 'core', null),
    ('ヒー', 'hii', 'choonpu_example', base_sort_order + 27, 'choonpu', 'example', 'native', 'core', null),
    ('フー', 'fuu', 'choonpu_example', base_sort_order + 28, 'choonpu', 'example', 'native', 'core', null),
    ('ヘー', 'hee', 'choonpu_example', base_sort_order + 29, 'choonpu', 'example', 'native', 'core', null),
    ('ホー', 'hoo', 'choonpu_example', base_sort_order + 30, 'choonpu', 'example', 'native', 'core', null),
    ('マー', 'maa', 'choonpu_example', base_sort_order + 31, 'choonpu', 'example', 'native', 'core', null),
    ('ミー', 'mii', 'choonpu_example', base_sort_order + 32, 'choonpu', 'example', 'native', 'core', null),
    ('ムー', 'muu', 'choonpu_example', base_sort_order + 33, 'choonpu', 'example', 'native', 'core', null),
    ('メー', 'mee', 'choonpu_example', base_sort_order + 34, 'choonpu', 'example', 'native', 'core', null),
    ('モー', 'moo', 'choonpu_example', base_sort_order + 35, 'choonpu', 'example', 'native', 'core', null),
    ('ヤー', 'yaa', 'choonpu_example', base_sort_order + 36, 'choonpu', 'example', 'native', 'core', null),
    ('ユー', 'yuu', 'choonpu_example', base_sort_order + 37, 'choonpu', 'example', 'native', 'core', null),
    ('ヨー', 'yoo', 'choonpu_example', base_sort_order + 38, 'choonpu', 'example', 'native', 'core', null),
    ('ラー', 'raa', 'choonpu_example', base_sort_order + 39, 'choonpu', 'example', 'native', 'core', null),
    ('リー', 'rii', 'choonpu_example', base_sort_order + 40, 'choonpu', 'example', 'native', 'core', null),
    ('ルー', 'ruu', 'choonpu_example', base_sort_order + 41, 'choonpu', 'example', 'native', 'core', null),
    ('レー', 'ree', 'choonpu_example', base_sort_order + 42, 'choonpu', 'example', 'native', 'core', null),
    ('ロー', 'roo', 'choonpu_example', base_sort_order + 43, 'choonpu', 'example', 'native', 'core', null),
    ('ワー', 'waa', 'choonpu_example', base_sort_order + 44, 'choonpu', 'example', 'native', 'core', null),
    ('ヲー', 'woo', 'choonpu_example', base_sort_order + 45, 'choonpu', 'example', 'native', 'core', null),
    ('ンー', 'nn', 'choonpu_example', base_sort_order + 46, 'choonpu', 'example', 'native', 'core', null);
end $$;

-- Fold back into contiguous, section-ordered sort_order (same section_rank scheme as
-- 20260829_move_yoon_above_sokuon.sql) and re-cluster.
with ranked as (
  select
    id,
    row_number() over (
      order by
        case kana_type
          when 'seion' then 1
          when 'dakuten' then 2
          when 'handakuten' then 3
          when 'yoon' then 4
          when 'sokuon' then 5
          when 'choonpu' then 6
          when 'n_gemination' then 7
          when 'extended' then 8
          when 'historical' then 9
        end,
        case gojuon_row
          when 'historical_wa' then 0
          when 'historical_va' then 1
          when 'iteration_unvoiced' then 2
          when 'iteration_voiced' then 3
          else 0
        end,
        case when entry_kind = 'rule' then 0 else 1 end,
        id
    ) as new_sort_order
  from public.katakana
)
update public.katakana t
set sort_order = ranked.new_sort_order + 100000
from ranked
where ranked.id = t.id;

update public.katakana
set sort_order = sort_order - 100000;

cluster public.katakana using katakana_sort_order_key;
