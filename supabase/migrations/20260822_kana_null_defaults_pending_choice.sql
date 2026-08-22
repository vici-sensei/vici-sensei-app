-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- Onboarding Step 1 (kana) needs to distinguish "hasn't answered yet" from "answered
-- and it happens to match a default" -- study_track defaulting to 'standard' made
-- those indistinguishable, so a fresh row already looked like the user had picked
-- "Yes" before they'd touched the toggle. Same issue for enabled_levels, which
-- defaulted to a real value ({N5}) before Step 2 ever ran.
--
-- study_hiragana/study_katakana/study_kanji/study_vocabulary are NOT touched here --
-- they already default to false/NOT NULL in the base schema, which is exactly the
-- "nothing chosen yet" state the spec wants for them (unlike study_track/enabled_levels,
-- there's no ambiguous non-null default to escape).
--
-- These two columns now default to NULL and stay NULL until Step 1 (and, for
-- enabled_levels, Step 2) actually writes a value via persistStepData(). The onboarding
-- UI already treats "furthest step not yet reached" as the signal to not trust these
-- columns (see app/onboarding/page.tsx's progress-seed effect), so this just makes the
-- DB match what the client already assumed.

alter table public.user_study_settings
  alter column enabled_levels drop not null,
  alter column enabled_levels set default null,
  alter column study_track drop not null,
  alter column study_track set default null;

-- The existing check required a non-empty array unconditionally (coalesce(...,0) >= 1
-- turns a NULL length into 0, which fails the >= 1 test) -- NULL itself needs to be an
-- explicitly allowed state now, not just a non-empty subset of the five JLPT levels.
alter table public.user_study_settings
  drop constraint user_study_settings_enabled_levels_check;

alter table public.user_study_settings
  add constraint user_study_settings_enabled_levels_check
  check (
    enabled_levels is null
    or (enabled_levels <@ array['N5','N4','N3','N2','N1']::text[]
        and coalesce(array_length(enabled_levels, 1), 0) >= 1)
  );

-- FOREACH ... IN ARRAY raises "FOREACH expression must not be null" on a NULL array, so
-- without this guard every insert of a fresh (all-NULL) row would fail outright.
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
  if new.enabled_levels is null then
    return new;
  end if;

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
$function$;
