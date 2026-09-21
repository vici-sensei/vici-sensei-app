-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Lets a student pick exactly how far down the cascade goes, instead of only
-- "all the way to N5" or "off". normalize_enabled_levels() previously ignored
-- whatever floor the client sent and always expanded down to N5 whenever
-- include_lower_levels was true; now it keeps the client's floor (still
-- filling in any gap so the stored range stays contiguous) and only
-- collapses to a single level when include_lower_levels is false.

create or replace function public.normalize_enabled_levels()
 returns trigger
 language plpgsql
as $function$
declare
  v_order text[] := array['N5','N4','N3','N2','N1'];
  v_max_idx int := 0;
  v_min_idx int := 6;
  v_level text;
  v_idx int;
begin
  foreach v_level in array new.enabled_levels loop
    v_idx := array_position(v_order, v_level);
    if v_idx is null then
      raise exception 'Invalid JLPT level in enabled_levels: %', v_level;
    end if;
    v_max_idx := greatest(v_max_idx, v_idx);
    v_min_idx := least(v_min_idx, v_idx);
  end loop;

  if v_max_idx = 0 then
    raise exception 'enabled_levels must contain at least one JLPT level';
  end if;

  if new.include_lower_levels then
    new.enabled_levels := v_order[v_min_idx:v_max_idx];
  else
    new.enabled_levels := array[v_order[v_max_idx]];
  end if;

  return new;
end;
$function$
;
