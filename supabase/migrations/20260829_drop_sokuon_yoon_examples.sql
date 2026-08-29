-- Drops the sokuon+yōon combination examples (gojuon_row='sokuon_yoon') from the Sokuon
-- subsection of "Sound Rules & Combinations", in both public.hiragana (id 135-146: っきゃ/っきゅ/
-- っきょ/っしゃ/っしゅ/っしょ/っちゃ/っちゅ/っちょ/っぴゃ/っぴゅ/っぴょ) and public.katakana
-- (id 172-183: ッキャ/ッキュ/ッキョ/ッシャ/ッシュ/ッショ/ッチャ/ッチュ/ッチョ/ッピャ/ッピュ/ッピョ)
-- -- per user request. The user's message said "/browse/hiragana" for both lists, but the second
-- list is katakana characters (ッ, not っ) -- treated as a typo and applied to public.katakana,
-- since the characters unambiguously identify the table. Verified zero references in
-- user_hiragana_progress/user_katakana_progress/review_logs for all 24 ids before writing this.
--
-- Remaining rows' sort_order renumbered to stay contiguous in each table, then re-clustered (same
-- approach as the prior kana-ordering migrations).

delete from public.hiragana where id between 135 and 146;
delete from public.katakana where id between 172 and 183;

do $$
declare
  tbl text;
begin
  foreach tbl in array array['hiragana', 'katakana'] loop
    execute format($f$
      with ranked as (
        select id, row_number() over (order by sort_order) as new_sort_order
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
