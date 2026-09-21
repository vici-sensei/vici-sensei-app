-- The previous CLUSTER pass (20260828_cluster_kana_by_sort_order.sql) made physical storage
-- match sort_order, but sort_order itself had three "rule" cards stranded far from the section
-- they belong to: dakuten_rule/handakuten_rule sat at the very end of each table (after Historical
-- & Rare) instead of right before their Dakuten/Handakuten character grid, and yoon_rule sat after
-- Choonpu instead of right before the Yoon examples. Browse (BrowseKanaListPage.tsx) always
-- pulls a section's rule card out with .find() and renders it first regardless of position, so the
-- UI never showed the problem -- but the raw table order (e.g. Supabase Studio's default view)
-- did. This renumbers sort_order to match Browse's actual rendered order section-by-section, then
-- re-clusters so physical storage matches again.
--
-- id == sort_order for every row in both tables (verified before writing this), so id is used as
-- the stable within-group tiebreaker below -- it reflects each row's original insertion order,
-- which was already correct within every group except the three strays called out above.

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
                when 'sokuon' then 4
                when 'choonpu' then 5
                when 'yoon' then 6
                when 'n_gemination' then 7
                when 'rendaku' then 8
                when 'particle_reading' then 9
                when 'extended' then 10
                when 'historical' then 11
              end,
              case gojuon_row
                when 'particle_ha' then 0
                when 'particle_he' then 1
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
