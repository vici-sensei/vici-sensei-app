-- Moves the Yōon block above Sokuon in public.hiragana/public.katakana's sort_order, matching the
-- SOUND_RULE_SECTIONS reorder in BrowseKanaListPage.tsx (Yōon now listed before Sokuon). Same
-- section_rank/subgroup_rank/item_rank renumbering technique as
-- 20260828_fix_kana_rule_card_ordering.sql, just with yoon's rank moved ahead of sokuon's; every
-- other section keeps its relative order (Chōonpu still follows Sokuon, unchanged, since only
-- Yōon was asked to move). rendaku/particle_reading are no longer present in either table (moved
-- out / dropped in prior migrations) and are omitted from the ranking below.

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
