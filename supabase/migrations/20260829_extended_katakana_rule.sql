-- Adds an explanatory rule card for "Extended Katakana", the one Sound Rules & Combinations-style
-- section that never had one. sound_origin='loanword' matches the section's existing 19 character
-- rows (all loanword-origin); gojuon_row='extended_rule' keeps it out of groupByRow's per-family
-- grouping (va/she/je/che/ti/di/fa/wi), same pattern as dakuten_rule/sokuon_rule/etc.

insert into public.katakana (character, romaji, gojuon_row, sort_order, kana_type, entry_kind, sound_origin, frequency_tier, notes)
values (
  'ファ',
  'extended katakana',
  'extended_rule',
  (select coalesce(max(sort_order), 0) from public.katakana) + 1,
  'extended',
  'rule',
  'loanword',
  'core',
  'Extended Katakana: combinations invented to transcribe foreign sounds the classical 46-character syllabary can''t represent natively -- a small vowel (ァ/ィ/ゥ/ェ/ォ) or small ュ after a katakana that doesn''t take yōon in native words, e.g. ファ (fa), ヴァ (va), ティ (ti), チェ (che). Standardized by a 1991 government notice for transcribing loanwords more precisely.'
);

-- Fold back into contiguous, section-ordered sort_order (same scheme as
-- 20260829_katakana_n_gemination.sql -- the new rule sorts first within 'extended' via the
-- rule-before-example/character tiebreak) and re-cluster.
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
          when 'n_gemination' then 6
          when 'choonpu' then 7
          when 'extended' then 8
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
