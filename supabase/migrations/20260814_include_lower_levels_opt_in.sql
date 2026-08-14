-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Makes the cascade to easier JLPT levels opt-in instead of automatic.
-- Previously normalize_enabled_levels() always expanded enabled_levels down
-- to N5 (e.g. picking N3 stored ['N5','N4','N3']), so get_due_cards /
-- get_new_kanji_candidates / get_new_vocab_candidates -- which filter purely
-- on enabled_levels -- always served lower-level cards too.
--
-- With include_lower_levels defaulting to false, the trigger now collapses
-- enabled_levels down to just the picked level unless the student opts back
-- in. This only changes what gets served going forward -- review_logs and
-- the user_*_progress tables (a student's history on lower-level cards
-- they've already studied) are untouched either way.

alter table public.user_study_settings
  add column include_lower_levels bool not null default false;

create or replace function public.normalize_enabled_levels()
 returns trigger
 language plpgsql
as $function$
declare
  v_order text[] := array['N5','N4','N3','N2','N1'];
  v_max_idx int := 0;
  v_level text;
  v_idx int;
begin
  foreach v_level in array new.enabled_levels loop
    v_idx := array_position(v_order, v_level);
    if v_idx is null then
      raise exception 'Invalid JLPT level in enabled_levels: %', v_level;
    end if;
    v_max_idx := greatest(v_max_idx, v_idx);
  end loop;

  if v_max_idx = 0 then
    raise exception 'enabled_levels must contain at least one JLPT level';
  end if;

  if new.include_lower_levels then
    new.enabled_levels := v_order[1:v_max_idx];
  else
    new.enabled_levels := array[v_order[v_max_idx]];
  end if;

  return new;
end;
$function$
;

-- Re-run the trigger over existing rows so already-stored enabled_levels
-- collapse to match the new default (include_lower_levels = false).
update public.user_study_settings set updated_at = now();
