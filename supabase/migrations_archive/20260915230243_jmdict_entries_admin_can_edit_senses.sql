-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Lets an admin pick, per jmdict_entries row, which sense(s) in `senses` count as primary
-- (multiple allowed) from an in-app page, instead of primary_meanings/other_meanings only ever
-- being set by the one-off backfill in 20261124_jmdict_entries_backfill_primary_other_meanings.sql.
--
-- Storage choice: the flag lives as `is_primary: boolean` inside each `senses[]` element (jsonb,
-- schemaless -- no DDL needed for that part) rather than as a separate parallel column, since
-- `senses` is already the single per-sense source of truth and primary_meanings/other_meanings
-- are meant to be *derived* display columns, not independently editable. A trigger keeps them in
-- sync with `senses` on every write, so the admin UI only ever needs to save `senses` -- it never
-- computes primary_meanings/other_meanings itself. A sense with no `is_primary` key is treated as
-- false; if NO sense in a row is explicitly marked, sense #1 is treated as primary (matches the
-- default every row already got from the 20261124 backfill), so untouched rows keep behaving
-- exactly as before until an admin actually edits them here.

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
    select string_agg(g ->> 'text', ', ' order by ord, g_ord)
    from jsonb_array_elements(new.senses) with ordinality as t(s, ord)
    cross join lateral jsonb_array_elements(t.s -> 'gloss') with ordinality as u(g, g_ord)
    where case when any_marked then coalesce((t.s ->> 'is_primary')::boolean, false) else ord = 1 end
  );

  new.other_meanings := coalesce((
    select array_agg(
      (select string_agg(g ->> 'text', ', ') from jsonb_array_elements(t.s -> 'gloss') g)
      order by ord
    )
    from jsonb_array_elements(new.senses) with ordinality as t(s, ord)
    where not (case when any_marked then coalesce((t.s ->> 'is_primary')::boolean, false) else ord = 1 end)
  ), '{}');

  return new;
end;
$$;

comment on function public.sync_jmdict_entries_primary_other_meanings() is 'Recomputes jmdict_entries.primary_meanings/other_meanings from senses[].is_primary whenever senses is written. No sense marked primary -> falls back to sense #1, matching the 20261124 backfill default.';

create trigger trg_sync_jmdict_entries_primary_other_meanings
  before insert or update of senses on public.jmdict_entries
  for each row execute function public.sync_jmdict_entries_primary_other_meanings();

-- Second admin write path on this table (the first, for vocabulary_id/match_method, was retired
-- in 20261121). Same enforcement pattern as 20261117_jmdict_entries_admin_update_policy.sql:
-- column-scoped grant + is_admin()-gated RLS policy, since this app has no server-side write
-- layer -- every mutation goes through the anon-key browser client.
grant update (senses) on public.jmdict_entries to authenticated;

create policy "Admins can update jmdict_entries senses"
  on public.jmdict_entries for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Backfill: mark is_primary=true on the specific sense each of the 9 confirmed overrides from
-- 20261124 already promoted, so the new admin page shows them pre-checked instead of appearing
-- to have reverted to sense #1. This UPDATE fires the trigger above, which recomputes
-- primary_meanings/other_meanings -- they should come out byte-identical to what 20261124 already
-- set, since it's the same selection expressed a different way.
with overrides(entry_id, p_idx) as (
  values
    (23758, 2), (69725, 2), (26823, 6), (3784, 2), (10946, 2),
    (12317, 4), (16427, 4), (54930, 2), (2863, 3)
)
update public.jmdict_entries e
set senses = (
  select jsonb_agg(
    case when ord = o.p_idx then t.s || jsonb_build_object('is_primary', true) else t.s end
    order by ord
  )
  from jsonb_array_elements(e.senses) with ordinality as t(s, ord)
)
from overrides o
where e.id = o.entry_id;
