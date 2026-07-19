-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Enforces that user_study_settings.enabled_levels is always a cumulative,
-- ordered range from N5 up to whichever level the user picked (e.g. picking
-- N2 stores ['N5','N4','N3','N2']), and that it can only ever contain the
-- five real JLPT levels. This models the assumption that a user studying at
-- N2 should still be reviewing N5-N3 content, not skipping it.

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

  new.enabled_levels := v_order[1:v_max_idx];
  return new;
end;
$function$
;

drop trigger if exists normalize_enabled_levels_trigger on public.user_study_settings;

create trigger normalize_enabled_levels_trigger
  before insert or update on public.user_study_settings
  for each row
  execute function public.normalize_enabled_levels();

-- Re-run the trigger over existing rows so already-stored data conforms
-- before the CHECK constraint below is added.
update public.user_study_settings set updated_at = now();

alter table public.user_study_settings
  add constraint user_study_settings_enabled_levels_check
  check (
    enabled_levels <@ array['N5','N4','N3','N2','N1']::text[]
    and coalesce(array_length(enabled_levels, 1), 0) >= 1
  );
