-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Two independent changes, bundled since both touch the same kana pipeline:
--
-- 1. Selective examples: entry_kind = 'example' rows now carry a `drillable` flag. Only the
--    user-curated subset below (drillable = true) ever gets introduced into
--    user_hiragana_progress/user_katakana_progress and produces a hiragana_reading/
--    katakana_reading card; every other example row (drillable = false) never enters the study
--    pipeline at all -- same as entry_kind = 'rule' rows, it stays reference-only content (still
--    shown in full on /browse and in its new_rule card's example grid, which is unaffected -- see
--    20260904_kana_rule_cards.sql's `examples` subquery, which selects on entry_kind alone).
--
--    get_new_hiragana_candidates/get_new_katakana_candidates gain a `drillable` filter so
--    non-drillable examples are never offered as candidates. get_new_hiragana_rule_candidates/
--    get_new_katakana_rule_candidates' interleaving check (20260904_kana_rule_cards.sql) is
--    updated the same way -- critical, not optional: without this fix a non-drillable row that
--    can now NEVER gain a progress row would permanently satisfy "not yet introduced" forever,
--    blocking every later rule from ever becoming reachable.
--
-- 2. Drill scoped to kana_type = 'seion' only: the post-introduction drill (repeat until 3
--    correct in a row, no Hard/Good/Easy -- 20260827_hiragana_katakana_drill.sql) now only
--    applies to seion characters. Everything else (dakuten, handakuten, and every drillable
--    example) skips straight to normal Hard/Good/Easy grading via submit_review from its very
--    first review -- submit_review already handles hiragana_reading/katakana_reading completely
--    generically (no drill-specific special-casing to remove there), so the only server-side
--    change needed is exposing kana_type on get_due_cards/get_hiragana_reading_cards/
--    get_katakana_reading_cards so the client can decide which flow a card gets. Both are
--    dropped and recreated -- adding a column changes their return row type.

-- ---------------------------------------------------------------------------
-- 1a. drillable column + data.
-- ---------------------------------------------------------------------------
alter table public.hiragana add column drillable boolean not null default true;
alter table public.katakana add column drillable boolean not null default true;

update public.hiragana set drillable = false where entry_kind = 'example';
update public.katakana set drillable = false where entry_kind = 'example';

update public.hiragana set drillable = true where entry_kind = 'example' and (("character", romaji) in (
  ('ちゃ', 'cha'), ('しゅ', 'shu'), ('じょ', 'jo'), ('にゃ', 'nya'), ('ぴょ', 'pyo'), ('きゅ', 'kyu'),
  ('っき', 'kki'), ('って', 'tte'), ('っす', 'ssu'),
  ('んな', 'nna')
));

update public.katakana set drillable = true where entry_kind = 'example' and (("character", romaji) in (
  ('チュ', 'chu'), ('ショ', 'sho'), ('ジャ', 'ja'), ('ヒュ', 'hyu'), ('ギョ', 'gyo'), ('ミャ', 'mya'),
  ('ッグ', 'ggu'), ('ット', 'tto'), ('ッジ', 'jji'),
  ('ンナ', 'nna'),
  ('カー', 'kaa'), ('チー', 'chii'), ('ワー', 'waa'),
  ('ヴ', 'vu'), ('ヴァ', 'va'), ('シェ', 'she'), ('チェ', 'che'), ('ティ', 'ti'), ('トゥ', 'tu'), ('フォ', 'fo'), ('ウェ', 'we')
));

-- ---------------------------------------------------------------------------
-- 1b. get_new_hiragana_candidates/get_new_katakana_candidates: exclude non-drillable examples.
--     Return shape unchanged (still returns entry_kind, added in 20260906_kana_examples_skip_intro_card.sql).
-- ---------------------------------------------------------------------------
create or replace function public.get_new_hiragana_candidates(p_user_id uuid, p_limit integer)
returns table(id bigint, "character" text, romaji text, gojuon_row text, sort_order integer, entry_kind text)
language sql
stable
as $function$
  with candidates as (
    select h.id, h."character", h.romaji, h.gojuon_row, h.sort_order, h.entry_kind
    from public.hiragana h
    where h.entry_kind != 'rule'
    and h.drillable
    and not exists (
      select 1 from public.user_hiragana_progress p
      where p.user_id = p_user_id and p.hiragana_id = h.id
    )
    and exists (
      select 1 from public.user_study_settings s
      where s.user_id = p_user_id and s.study_track = 'kana' and s.study_hiragana
    )
  ),
  row_stats as (
    select gojuon_row, min(sort_order) as row_sort, count(*) as row_count
    from candidates
    group by gojuon_row
  ),
  row_cum as (
    select gojuon_row, row_count,
           sum(row_count) over (order by row_sort) as cum_count
    from row_stats
  ),
  selected_rows as (
    select gojuon_row
    from row_cum
    where cum_count - row_count < p_limit
  )
  select c.id, c."character", c.romaji, c.gojuon_row, c.sort_order, c.entry_kind
  from candidates c
  join selected_rows sr on sr.gojuon_row = c.gojuon_row
  order by c.sort_order asc;
$function$;

create or replace function public.get_new_katakana_candidates(p_user_id uuid, p_limit integer)
returns table(id bigint, "character" text, romaji text, gojuon_row text, sort_order integer, entry_kind text)
language sql
stable
as $function$
  with candidates as (
    select k.id, k."character", k.romaji, k.gojuon_row, k.sort_order, k.entry_kind
    from public.katakana k
    where k.entry_kind != 'rule'
    and k.drillable
    and not exists (
      select 1 from public.user_katakana_progress p
      where p.user_id = p_user_id and p.katakana_id = k.id
    )
    and exists (
      select 1 from public.user_study_settings s
      where s.user_id = p_user_id and s.study_track = 'kana' and s.study_katakana
    )
  ),
  row_stats as (
    select gojuon_row, min(sort_order) as row_sort, count(*) as row_count
    from candidates
    group by gojuon_row
  ),
  row_cum as (
    select gojuon_row, row_count,
           sum(row_count) over (order by row_sort) as cum_count
    from row_stats
  ),
  selected_rows as (
    select gojuon_row
    from row_cum
    where cum_count - row_count < p_limit
  )
  select c.id, c."character", c.romaji, c.gojuon_row, c.sort_order, c.entry_kind
  from candidates c
  join selected_rows sr on sr.gojuon_row = c.gojuon_row
  order by c.sort_order asc;
$function$;

-- ---------------------------------------------------------------------------
-- 1c. get_new_hiragana_rule_candidates/get_new_katakana_rule_candidates: the
--     char_candidates CTE and the interleaving "nothing un-introduced precedes this rule" check
--     both gain the same `drillable` filter, so a permanently-excluded non-drillable example can
--     never block a later rule from becoming reachable. Return shape unchanged.
-- ---------------------------------------------------------------------------
create or replace function public.get_new_hiragana_rule_candidates(p_user_id uuid, p_limit integer)
returns table(
  id bigint, "character" text, notes text, kana_type text, sort_order integer,
  label text, technical_term text, examples jsonb
)
language sql
stable
as $function$
  with char_candidates as (
    select h.id, h.gojuon_row, h.sort_order
    from public.hiragana h
    where h.entry_kind != 'rule'
    and h.drillable
    and not exists (
      select 1 from public.user_hiragana_progress p
      where p.user_id = p_user_id and p.hiragana_id = h.id
    )
  ),
  row_stats as (
    select gojuon_row, min(sort_order) as row_sort, count(*) as row_count
    from char_candidates
    group by gojuon_row
  ),
  row_cum as (
    select gojuon_row, row_count, sum(row_count) over (order by row_sort) as cum_count
    from row_stats
  ),
  about_to_introduce as (
    select c.id
    from char_candidates c
    join row_cum rc on rc.gojuon_row = c.gojuon_row
    where rc.cum_count - rc.row_count < p_limit
  )
  select
    r.id, r."character", r.notes, r.kana_type, r.sort_order,
    krl.label, krl.technical_term,
    (
      select coalesce(
        jsonb_agg(jsonb_build_object('character', e."character", 'romaji', e.romaji, 'gojuon_row', e.gojuon_row) order by e.sort_order),
        '[]'::jsonb
      )
      from public.hiragana e
      where e.kana_type = r.kana_type and e.entry_kind = 'example'
    ) as examples
  from public.hiragana r
  left join public.kana_rule_labels krl on krl.kana_type = r.kana_type
  where r.entry_kind = 'rule'
    and not exists (
      select 1 from public.user_hiragana_rule_progress up
      where up.user_id = p_user_id and up.hiragana_id = r.id
    )
    and exists (
      select 1 from public.user_study_settings s
      where s.user_id = p_user_id and s.study_track = 'kana' and s.study_hiragana
    )
    and not exists (
      select 1 from public.hiragana h
      where h.entry_kind != 'rule'
        and h.drillable
        and h.sort_order < r.sort_order
        and not exists (select 1 from public.user_hiragana_progress p where p.user_id = p_user_id and p.hiragana_id = h.id)
        and not exists (select 1 from about_to_introduce a where a.id = h.id)
    )
  order by r.sort_order asc;
$function$;

create or replace function public.get_new_katakana_rule_candidates(p_user_id uuid, p_limit integer)
returns table(
  id bigint, "character" text, notes text, kana_type text, sort_order integer,
  label text, technical_term text, examples jsonb
)
language sql
stable
as $function$
  with char_candidates as (
    select k.id, k.gojuon_row, k.sort_order
    from public.katakana k
    where k.entry_kind != 'rule'
    and k.drillable
    and not exists (
      select 1 from public.user_katakana_progress p
      where p.user_id = p_user_id and p.katakana_id = k.id
    )
  ),
  row_stats as (
    select gojuon_row, min(sort_order) as row_sort, count(*) as row_count
    from char_candidates
    group by gojuon_row
  ),
  row_cum as (
    select gojuon_row, row_count, sum(row_count) over (order by row_sort) as cum_count
    from row_stats
  ),
  about_to_introduce as (
    select c.id
    from char_candidates c
    join row_cum rc on rc.gojuon_row = c.gojuon_row
    where rc.cum_count - rc.row_count < p_limit
  )
  select
    r.id, r."character", r.notes, r.kana_type, r.sort_order,
    krl.label, krl.technical_term,
    (
      select coalesce(
        jsonb_agg(jsonb_build_object('character', e."character", 'romaji', e.romaji, 'gojuon_row', e.gojuon_row) order by e.sort_order),
        '[]'::jsonb
      )
      from public.katakana e
      where e.kana_type = r.kana_type and e.entry_kind = 'example'
    ) as examples
  from public.katakana r
  left join public.kana_rule_labels krl on krl.kana_type = r.kana_type
  where r.entry_kind = 'rule'
    and not exists (
      select 1 from public.user_katakana_rule_progress up
      where up.user_id = p_user_id and up.katakana_id = r.id
    )
    and exists (
      select 1 from public.user_study_settings s
      where s.user_id = p_user_id and s.study_track = 'kana' and s.study_katakana
    )
    and not exists (
      select 1 from public.katakana k
      where k.entry_kind != 'rule'
        and k.drillable
        and k.sort_order < r.sort_order
        and not exists (select 1 from public.user_katakana_progress p where p.user_id = p_user_id and p.katakana_id = k.id)
        and not exists (select 1 from about_to_introduce a where a.id = k.id)
    )
  order by r.sort_order asc;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Expose kana_type on get_due_cards/get_hiragana_reading_cards/get_katakana_reading_cards, so
--    the client can gate the drill (ReviewCardKanaReading, useStudyQueue's isDrillCard/finishPack)
--    to kana_type = 'seion' only. null for every non-kana row.
-- ---------------------------------------------------------------------------
drop function if exists public.get_due_cards(uuid, text[], boolean, boolean, boolean, boolean, integer);
drop function if exists public.get_hiragana_reading_cards(uuid, bigint[]);
drop function if exists public.get_katakana_reading_cards(uuid, bigint[]);

create function public.get_due_cards(p_user_id uuid, p_enabled_levels text[], p_include_kanji boolean, p_include_vocab boolean, p_include_hiragana boolean, p_include_katakana boolean, p_limit integer)
 returns table(exercise_type text, progress_id bigint, kanji_id bigint, word_id bigint, kanji_word_id bigint, hiragana_id bigint, katakana_id bigint, kanji_char text, kanji_meanings text[], word text, kana_reading text, romaji_reading text, other_readings text[], furiganas text[], word_meanings text[], all_word_meanings text[], all_word_readings text[], known_kanji_chars text[], kana_character text, kana_romaji text, kana_type text, drill_streak integer, status text, ease_factor numeric, interval_days integer, repetitions integer, lapses integer, learning_step integer)
 language sql
 stable
as $function$
  with settings as (
    select study_track, study_kanji, study_vocabulary, study_hiragana, study_katakana
    from public.user_study_settings
    where user_id = p_user_id
  )
  select exercise_type, progress_id, kanji_id, word_id, kanji_word_id, hiragana_id, katakana_id,
         kanji_char, kanji_meanings, word, kana_reading, romaji_reading,
         other_readings, furiganas, word_meanings, all_word_meanings, all_word_readings,
         known_kanji_chars, kana_character, kana_romaji, kana_type, drill_streak,
         status, ease_factor, interval_days, repetitions, lapses, learning_step
  from (
    select
      'kanji_meaning'::text as exercise_type,
      p.id as progress_id,
      p.kanji_id,
      null::bigint as word_id,
      null::bigint as kanji_word_id,
      null::bigint as hiragana_id,
      null::bigint as katakana_id,
      p.due_at,
      k.kanji as kanji_char, k.meanings as kanji_meanings,
      null::text as word, null::text as kana_reading,
      null::text as romaji_reading, null::text[] as other_readings,
      null::text[] as furiganas,
      null::text[] as word_meanings,
      null::text[] as all_word_meanings,
      null::text[] as all_word_readings,
      null::text[] as known_kanji_chars,
      null::text as kana_character, null::text as kana_romaji, null::text as kana_type,
      null::integer as drill_streak,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_kanji_meaning_progress p
    join public.kanji k on k.id = p.kanji_id
    cross join settings
    where settings.study_track = 'standard'
      and settings.study_kanji
      and p.user_id = p_user_id
      and p.due_at <= now()
      and p.status != 'suspended'
      and k.level = any(p_enabled_levels)

    union all

    select
      'kanji_reading'::text,
      p.id, p.kanji_id, null::bigint, p.kanji_word_id,
      null::bigint, null::bigint,
      p.due_at,
      k.kanji, k.meanings,
      v.word, v.kana_reading,
      v.romaji_reading, v.other_readings,
      v.furiganas,
      null::text[] as word_meanings,
      null::text[] as all_word_meanings,
      (
        select array_agg(distinct r)
        from (
          select v2.kana_reading as r from public.vocabulary v2 where v2.word = v.word and v2.kana_reading is not null
          union
          select v2.romaji_reading from public.vocabulary v2 where v2.word = v.word and v2.romaji_reading is not null
          union
          select unnest(v2.other_readings) from public.vocabulary v2 where v2.word = v.word
        ) readings
      ) as all_word_readings,
      (
        select array_agg(distinct k2.kanji)
        from public.kanji_word kw2
        join public.kanji k2 on k2.id = kw2.id_kanji
        where kw2.id_word = v.id
          and kw2.id_kanji != p.kanji_id
          and exists (
            select 1
            from public.kanji_word kw3
            join public.user_kanji_reading_progress p3 on p3.kanji_word_id = kw3.id
            where kw3.id_kanji = kw2.id_kanji
              and kw3.reading_group = kw2.reading_group
              and p3.user_id = p_user_id
              and p3.status = 'review'
              and p3.repetitions >= 2
          )
      ) as known_kanji_chars,
      null::text as kana_character, null::text as kana_romaji, null::text as kana_type,
      null::integer as drill_streak,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_kanji_reading_progress p
    join public.kanji_word kw on kw.id = p.kanji_word_id
    join public.kanji k on k.id = p.kanji_id
    join public.vocabulary v on v.id = kw.id_word
    cross join settings
    where settings.study_track = 'standard'
      and settings.study_kanji
      and p.user_id = p_user_id
      and p.due_at <= now()
      and p.status != 'suspended'
      and k.level = any(p_enabled_levels)

    union all

    select
      'vocab_meaning'::text,
      p.id, null::bigint, p.word_id, null::bigint,
      null::bigint, null::bigint,
      p.due_at,
      null::text, null::text[],
      v.word, v.kana_reading,
      null::text, null::text[],
      v.furiganas,
      v.meanings as word_meanings,
      (
        select array_agg(distinct m)
        from (
          select unnest(v2.meanings) as m
          from public.vocabulary v2
          where v2.word = v.word
            and v2.kana_reading is not distinct from v.kana_reading
        ) meanings
      ) as all_word_meanings,
      null::text[] as all_word_readings,
      null::text[] as known_kanji_chars,
      null::text as kana_character, null::text as kana_romaji, null::text as kana_type,
      null::integer as drill_streak,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_vocabulary_progress p
    join public.vocabulary v on v.id = p.word_id
    cross join settings
    where settings.study_track = 'standard'
      and settings.study_vocabulary
      and p.user_id = p_user_id
      and p.due_at <= now()
      and p.status != 'suspended'
      and not p.pending_batch
      and v.jlpt_level = any(p_enabled_levels)

    union all

    select
      'hiragana_reading'::text,
      p.id, null::bigint, null::bigint, null::bigint,
      p.hiragana_id, null::bigint,
      p.due_at,
      null::text, null::text[],
      null::text, null::text,
      null::text, null::text[],
      null::text[],
      null::text[] as word_meanings,
      null::text[] as all_word_meanings,
      null::text[] as all_word_readings,
      null::text[] as known_kanji_chars,
      h.character as kana_character, h.romaji as kana_romaji, h.kana_type,
      p.drill_streak,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_hiragana_progress p
    join public.hiragana h on h.id = p.hiragana_id
    cross join settings
    where settings.study_track = 'kana'
      and settings.study_hiragana
      and p.user_id = p_user_id
      and p.due_at <= now()
      and p.status != 'suspended'

    union all

    select
      'katakana_reading'::text,
      p.id, null::bigint, null::bigint, null::bigint,
      null::bigint, p.katakana_id,
      p.due_at,
      null::text, null::text[],
      null::text, null::text,
      null::text, null::text[],
      null::text[],
      null::text[] as word_meanings,
      null::text[] as all_word_meanings,
      null::text[] as all_word_readings,
      null::text[] as known_kanji_chars,
      k.character as kana_character, k.romaji as kana_romaji, k.kana_type,
      p.drill_streak,
      p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
    from public.user_katakana_progress p
    join public.katakana k on k.id = p.katakana_id
    cross join settings
    where settings.study_track = 'kana'
      and settings.study_katakana
      and p.user_id = p_user_id
      and p.due_at <= now()
      and p.status != 'suspended'
  ) due
  order by due_at asc
  limit p_limit;
$function$;

create function public.get_hiragana_reading_cards(p_user_id uuid, p_hiragana_ids bigint[])
returns table(
  exercise_type text, progress_id bigint, kanji_id bigint, word_id bigint, kanji_word_id bigint,
  hiragana_id bigint, katakana_id bigint,
  kanji_char text, kanji_meanings text[], word text, kana_reading text, romaji_reading text,
  other_readings text[], furiganas text[], word_meanings text[], all_word_meanings text[],
  all_word_readings text[], known_kanji_chars text[],
  kana_character text, kana_romaji text, kana_type text, drill_streak integer,
  status text, ease_factor numeric, interval_days integer, repetitions integer, lapses integer, learning_step integer
)
language sql
stable
as $function$
  select
    'hiragana_reading'::text as exercise_type,
    p.id as progress_id,
    null::bigint as kanji_id, null::bigint as word_id, null::bigint as kanji_word_id,
    p.hiragana_id, null::bigint as katakana_id,
    null::text as kanji_char, null::text[] as kanji_meanings,
    null::text as word, null::text as kana_reading,
    null::text as romaji_reading, null::text[] as other_readings,
    null::text[] as furiganas,
    null::text[] as word_meanings, null::text[] as all_word_meanings,
    null::text[] as all_word_readings, null::text[] as known_kanji_chars,
    h.character as kana_character, h.romaji as kana_romaji, h.kana_type, p.drill_streak,
    p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
  from unnest(p_hiragana_ids) with ordinality as ids(hiragana_id, ord)
  join public.user_hiragana_progress p on p.user_id = p_user_id and p.hiragana_id = ids.hiragana_id
  join public.hiragana h on h.id = p.hiragana_id
  where p.status != 'suspended'
  order by ids.ord;
$function$;

create function public.get_katakana_reading_cards(p_user_id uuid, p_katakana_ids bigint[])
returns table(
  exercise_type text, progress_id bigint, kanji_id bigint, word_id bigint, kanji_word_id bigint,
  hiragana_id bigint, katakana_id bigint,
  kanji_char text, kanji_meanings text[], word text, kana_reading text, romaji_reading text,
  other_readings text[], furiganas text[], word_meanings text[], all_word_meanings text[],
  all_word_readings text[], known_kanji_chars text[],
  kana_character text, kana_romaji text, kana_type text, drill_streak integer,
  status text, ease_factor numeric, interval_days integer, repetitions integer, lapses integer, learning_step integer
)
language sql
stable
as $function$
  select
    'katakana_reading'::text as exercise_type,
    p.id as progress_id,
    null::bigint as kanji_id, null::bigint as word_id, null::bigint as kanji_word_id,
    null::bigint as hiragana_id, p.katakana_id,
    null::text as kanji_char, null::text[] as kanji_meanings,
    null::text as word, null::text as kana_reading,
    null::text as romaji_reading, null::text[] as other_readings,
    null::text[] as furiganas,
    null::text[] as word_meanings, null::text[] as all_word_meanings,
    null::text[] as all_word_readings, null::text[] as known_kanji_chars,
    k.character as kana_character, k.romaji as kana_romaji, k.kana_type, p.drill_streak,
    p.status, p.ease_factor, p.interval_days, p.repetitions, p.lapses, p.learning_step
  from unnest(p_katakana_ids) with ordinality as ids(katakana_id, ord)
  join public.user_katakana_progress p on p.user_id = p_user_id and p.katakana_id = ids.katakana_id
  join public.katakana k on k.id = p.katakana_id
  where p.status != 'suspended'
  order by ids.ord;
$function$;

grant execute on function public.get_new_hiragana_candidates(uuid, integer) to authenticated;
grant execute on function public.get_new_katakana_candidates(uuid, integer) to authenticated;
grant execute on function public.get_new_hiragana_rule_candidates(uuid, integer) to authenticated;
grant execute on function public.get_new_katakana_rule_candidates(uuid, integer) to authenticated;
grant execute on function public.get_due_cards(uuid, text[], boolean, boolean, boolean, boolean, integer) to authenticated;
grant execute on function public.get_hiragana_reading_cards(uuid, bigint[]) to authenticated;
grant execute on function public.get_katakana_reading_cards(uuid, bigint[]) to authenticated;
