-- Scope: both live projects (EU-new zrgcullndfhouencqqqc + US-new wftwdbiqnlqsvgpeypmb), identical text. Never the frozen project.
--
-- The "New kanji / New vocabulary per day" caps now follow the student's own JLPT levels instead of
-- the whole database: a student on N5 can't set more new kanji per day than N5 has kanji (and, with
-- the 1:6 lock, not more words than 6x that, or than N5 has words). Hiragana/katakana have no
-- levels, so their caps are unchanged.
--
--  * effective_enabled_levels(levels, include_lower) -- the levels normalize_enabled_levels_trigger
--    will store (it fires AFTER clamp_new_card_caps_trigger, alphabetically, so the clamp can't
--    read its result and computes the same thing itself).
--  * get_new_card_caps_for_levels(levels) -- get_new_card_caps' numbers, counted only at those
--    levels (null/empty = every level, i.e. exactly the old behaviour). The settings page asks it
--    for the levels currently picked, to disable "+" at the cap.
--  * get_new_card_caps() keeps its signature and result (all levels) for any older client.
--  * clamp_new_card_caps() now clamps against the row's own levels -- on every insert/update,
--    so switching to a level with fewer kanji also lowers a limit that no longer fits.

begin;

create or replace function public.effective_enabled_levels(p_levels text[], p_include_lower boolean) returns text[]
    language sql immutable
    as $$
  with ordered as (
    select array['N5','N4','N3','N2','N1'] as o
  ),
  picked as (
    select min(array_position(o, l)) as lo, max(array_position(o, l)) as hi
    from ordered, unnest(coalesce(p_levels, '{}'::text[])) as l
  )
  select case
    when picked.hi is null then null
    when p_include_lower then ordered.o[picked.lo:picked.hi]
    else array[ordered.o[picked.hi]]
  end
  from ordered, picked;
$$;

create or replace function public.get_new_card_caps_for_levels(p_levels text[]) returns table(kanji_max integer, vocab_max integer, hiragana_max integer, katakana_max integer)
    language sql stable
    as $$
  with lv as (
    select case when p_levels is null or cardinality(p_levels) = 0 then null else p_levels end as levels
  ),
  totals as (
    select
      (select count(*) from public.kanji k, lv where lv.levels is null or k.level = any(lv.levels)) as kanji_total,
      (select count(*) from public.vocabulary v, lv where v.study_enabled and (lv.levels is null or v.jlpt_level = any(lv.levels))) as vocab_total,
      (select count(*) from public.hiragana where entry_kind != 'rule' and study_enabled) as hiragana_total,
      (select count(*) from public.katakana where entry_kind != 'rule' and study_enabled) as katakana_total
  ),
  -- Same 1:6 lock as before (sync_new_vocab_per_day_trigger): vocab_max is kanji_max * 6, and
  -- kanji_max is also held to what the level's vocabulary can feed at 6 words per kanji.
  kanji as (
    select greatest(least(kanji_total, floor(vocab_total::numeric / 6)::integer), 1) as kanji_max
    from totals
  )
  select
    kanji.kanji_max,
    kanji.kanji_max * 6 as vocab_max,
    greatest(floor(totals.hiragana_total::numeric / 5)::integer * 5, 5) as hiragana_max,
    greatest(floor(totals.katakana_total::numeric / 5)::integer * 5, 5) as katakana_max
  from totals, kanji;
$$;

create or replace function public.get_new_card_caps() returns table(kanji_max integer, vocab_max integer, hiragana_max integer, katakana_max integer)
    language sql stable
    as $$
  select * from public.get_new_card_caps_for_levels(null);
$$;

create or replace function public.clamp_new_card_caps() returns trigger
    language plpgsql
    as $$
declare
  caps record;
begin
  select * into caps
  from public.get_new_card_caps_for_levels(public.effective_enabled_levels(new.enabled_levels, new.include_lower_levels));

  new.new_kanji_per_day := least(new.new_kanji_per_day, caps.kanji_max);
  new.new_vocab_per_day := least(new.new_vocab_per_day, caps.vocab_max);
  new.new_hiragana_per_day := least(new.new_hiragana_per_day, caps.hiragana_max);
  new.new_katakana_per_day := least(new.new_katakana_per_day, caps.katakana_max);

  return new;
end;
$$;

grant all on function public.effective_enabled_levels(text[], boolean) to anon, authenticated, service_role;
grant all on function public.get_new_card_caps_for_levels(text[]) to anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
