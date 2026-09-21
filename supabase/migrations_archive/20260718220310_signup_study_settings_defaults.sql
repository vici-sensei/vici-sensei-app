-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- New users get a user_study_settings row automatically, seeded with only
-- N5 enabled (beginners shouldn't see N4-N1 content until they opt in via
-- PATCH /api/study-settings). The other columns keep using their existing
-- table defaults (new_kanji_per_day=2, new_vocab_per_day=12,
-- max_reviews_per_day=200, study_kanji=true, study_vocabulary=true).

alter table public.user_study_settings
  alter column enabled_levels set default '{N5}'::text[];

create or replace function public.handle_new_user()
 returns trigger
 language plpgsql
 security definer
as $function$
BEGIN
  INSERT INTO public.users (id, email, display_name, avatar_url)
  VALUES (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', 'User Nou'),
    new.raw_user_meta_data->>'avatar_url'
  );

  INSERT INTO public.user_study_settings (user_id)
  VALUES (new.id);

  RETURN new;
END;
$function$
;
