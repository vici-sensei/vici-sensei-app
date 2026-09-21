-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Changes primary_meanings from text to text[], and other_meanings from text[] (one element per
-- remaining sense, that sense's glosses comma-joined into one string) to jsonb holding a true 2D
-- array (one JSON array per remaining sense, each gloss its own string element).
--
-- other_meanings can't become a native Postgres text[][] for this: multidimensional arrays must
-- be rectangular (every sub-array the same length), and senses have wildly different gloss
-- counts (some 1, some 7+) -- Postgres rejects a literal ragged 2D array outright ("multidimensional
-- arrays must have array expressions with matching dimensions"). jsonb has no such restriction,
-- so it's the only way to get real per-sense, per-gloss nesting without padding every sense's
-- gloss list with filler NULLs up to the row's longest one.
--
-- Recomputing both columns from `senses` from scratch (via DROP+ADD, not an ALTER ... TYPE ...
-- USING cast) rather than reparsing the existing comma-joined text -- a handful of individual
-- glosses contain their own internal commas (e.g. jmdict_id for 分/ぶ: "3 mm (one-tenth of a
-- sun), 2.4 mm (one-tenth of a mon, ...)" is ONE gloss), so naively splitting on ", " would
-- fragment those. `senses` (jsonb, untouched by any of this) stays the one source of truth.

alter table public.jmdict_entries
  drop column primary_meanings,
  drop column other_meanings;

alter table public.jmdict_entries
  add column primary_meanings text[],
  add column other_meanings jsonb not null default '[]';

comment on column public.jmdict_entries.primary_meanings is 'Individual gloss strings (not joined) from the sense(s) marked is_primary in senses -- or sense #1''s glosses if none are marked. NULL until backfilled/edited via the sense-review admin page.';
comment on column public.jmdict_entries.other_meanings is 'jsonb array of arrays -- one inner array per non-primary sense, each holding that sense''s individual gloss strings. text[][] isn''t usable here: Postgres multidimensional arrays must be rectangular, and sense gloss counts vary per sense.';

create or replace function public.sync_jmdict_entries_primary_other_meanings()
returns trigger
language plpgsql
as $$
declare
  any_marked boolean;
begin
  select bool_or(coalesce((s ->> 'is_primary')::boolean, false))
    into any_marked
    from jsonb_array_elements(new.senses) s;

  new.primary_meanings := (
    select array_agg(g ->> 'text' order by ord, g_ord)
    from jsonb_array_elements(new.senses) with ordinality as t(s, ord)
    cross join lateral jsonb_array_elements(t.s -> 'gloss') with ordinality as u(g, g_ord)
    where case when any_marked then coalesce((t.s ->> 'is_primary')::boolean, false) else ord = 1 end
  );

  new.other_meanings := coalesce((
    select jsonb_agg(
      (select jsonb_agg(g ->> 'text' order by g_ord) from jsonb_array_elements(t.s -> 'gloss') with ordinality as u(g, g_ord))
      order by ord
    )
    from jsonb_array_elements(new.senses) with ordinality as t(s, ord)
    where not (case when any_marked then coalesce((t.s ->> 'is_primary')::boolean, false) else ord = 1 end)
  ), '[]'::jsonb);

  return new;
end;
$$;

-- Re-fires the trigger above (it's `before update of senses`, which fires whenever `senses`
-- appears in the SET list, even set to its own value) so every already-curated row gets
-- primary_meanings/other_meanings recomputed in the new shape without a separate backfill query.
update public.jmdict_entries
set senses = senses
where vocabulary_ids is not null
  and cardinality(vocabulary_ids) > 0;
