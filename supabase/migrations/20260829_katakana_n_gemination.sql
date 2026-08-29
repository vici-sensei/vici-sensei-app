-- Adds a katakana "ん Gemination" subsection to "Sound Rules & Combinations", mirroring
-- hiragana's (ン immediately followed by a ナ-row kana sounds like a doubled n, same mechanism as
-- hiragana's ん + な-row -- e.g. パンナコッタ "pannakotta"). Examples are mechanical (ン + ナ-row
-- kana), not real words, per user's established preference for this page's example cards; the
-- rule card's notes do cite one real loanword for illustration, matching the existing style of
-- katakana's sokuon/chōonpu rule notes (バッグ/コーヒー).
--
-- Placed between Sokuon and Chōonpu, per user request -- moved ahead of BrowseKanaListPage.tsx's
-- SOUND_RULE_SECTIONS reorder in the same commit (n_gemination now listed before choonpu there).

insert into public.katakana (character, romaji, gojuon_row, sort_order, kana_type, entry_kind, sound_origin, frequency_tier, notes)
select * from (values
  ('ン', 'n-gemination', 'n_gemination_rule', (select coalesce(max(sort_order), 0) from public.katakana) + 1, 'n_gemination', 'rule', 'native', 'core',
    'n-gemination: a katakana ン immediately followed by a ナ-row kana (ナ/ニ/ヌ/ネ/ノ) sounds like a doubled n, the same mechanism as hiragana''s ん + な-row -- ン itself carries the first half. Example: パンナコッタ (pannakotta, "panna cotta").'),
  ('ンナ', 'nna', 'n_gemination_example', (select coalesce(max(sort_order), 0) from public.katakana) + 2, 'n_gemination', 'example', 'native', 'core', null),
  ('ンニ', 'nni', 'n_gemination_example', (select coalesce(max(sort_order), 0) from public.katakana) + 3, 'n_gemination', 'example', 'native', 'core', null),
  ('ンヌ', 'nnu', 'n_gemination_example', (select coalesce(max(sort_order), 0) from public.katakana) + 4, 'n_gemination', 'example', 'native', 'core', null),
  ('ンネ', 'nne', 'n_gemination_example', (select coalesce(max(sort_order), 0) from public.katakana) + 5, 'n_gemination', 'example', 'native', 'core', null),
  ('ンノ', 'nno', 'n_gemination_example', (select coalesce(max(sort_order), 0) from public.katakana) + 6, 'n_gemination', 'example', 'native', 'core', null)
) as v(character, romaji, gojuon_row, sort_order, kana_type, entry_kind, sound_origin, frequency_tier, notes);

-- Fold both tables back into contiguous, section-ordered sort_order (n_gemination now ranks
-- between sokuon and choonpu) and re-cluster.
do $$
declare
  tbl text;
begin
  foreach tbl in array array['hiragana', 'katakana'] loop
    execute format($f$
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
        from public.%1$I
      )
      update public.%1$I t
      set sort_order = ranked.new_sort_order + 100000
      from ranked
      where ranked.id = t.id;

      update public.%1$I
      set sort_order = sort_order - 100000;
    $f$, tbl);

    execute format('cluster public.%I using %I_sort_order_key', tbl, tbl);
  end loop;
end $$;
