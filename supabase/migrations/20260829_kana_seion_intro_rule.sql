-- Adds a beginner-facing "what is hiragana / katakana" rule card at the top of the main seion
-- grid, for a student who doesn't know either script yet. gojuon_row='seion_rule' keeps it out of
-- groupByRow's per-row grouping (a/ka/sa/.../n), same pattern as dakuten_rule/handakuten_rule/etc.
-- sound_origin='native' matches the section's existing character rows (verified before writing
-- this) -- both scripts represent Japan's native sound inventory, unlike Extended Katakana's
-- loanword-only combinations.

insert into public.hiragana (character, romaji, gojuon_row, sort_order, kana_type, entry_kind, sound_origin, frequency_tier, notes)
values (
  'あ',
  'hiragana',
  'seion_rule',
  (select coalesce(max(sort_order), 0) from public.hiragana) + 1,
  'seion',
  'rule',
  'native',
  'core',
  'Hiragana (ひらがな): Japan''s core phonetic script, one of two syllabaries (alongside katakana) used together with kanji. Each symbol is one mora (a beat of sound, not a letter) arranged in this gojuon ("fifty sounds") grid by consonant row and vowel column (a/i/u/e/o); hiragana spells native Japanese words, grammar particles, and verb/adjective endings.'
);

insert into public.katakana (character, romaji, gojuon_row, sort_order, kana_type, entry_kind, sound_origin, frequency_tier, notes)
values (
  'ア',
  'katakana',
  'seion_rule',
  (select coalesce(max(sort_order), 0) from public.katakana) + 1,
  'seion',
  'rule',
  'native',
  'core',
  'Katakana (カタカナ): Japan''s other phonetic script -- the same 46 sounds as hiragana, just different shapes, arranged in the same gojuon ("fifty sounds") grid by consonant row and vowel column (a/i/u/e/o). It''s used mainly for words borrowed from other languages (loanwords), foreign names, onomatopoeia, and emphasis -- similar to how italics work in English.'
);

-- Fold each table back into contiguous, section-ordered sort_order (the new rule sorts first
-- within 'seion' via the rule-before-character tiebreak, same scheme as the prior kana-ordering
-- migrations) and re-cluster.
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
