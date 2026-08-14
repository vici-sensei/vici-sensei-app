-- Run this manually in DBeaver or the Supabase SQL editor.
--
-- users.display_name had a 50-char cap only in the client (ProfileSettingsForm's
-- maxLength + the >50 check before calling updateDisplayName) -- nothing stopped
-- a longer value from landing in the DB via a direct write, and nothing capped
-- the Google-OAuth-sourced full_name that handle_new_user() / handle_user_metadata_change()
-- copy in on sign-up / account switch, which is what was overflowing the
-- leaderboard rows. Add the constraint at the source of truth and truncate
-- both OAuth-populated paths so they can never violate it (a long Google name
-- must never be able to break sign-up).
--
-- If this fails with a check-constraint violation, some existing row already
-- exceeds 50 characters and needs manual truncation first.

alter table public.users
  add constraint users_display_name_length_check check (char_length(display_name) <= 50);


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
    left(coalesce(new.raw_user_meta_data->>'full_name', 'User Nou'), 50),
    new.raw_user_meta_data->>'avatar_url'
  );

  INSERT INTO public.user_study_settings (user_id)
  VALUES (new.id);

  RETURN new;
END;
$function$
;


create or replace function public.handle_user_metadata_change()
 returns trigger
 language plpgsql
 security definer
as $function$
declare
  v_full_name text := left(new.raw_user_meta_data->>'full_name', 50);
  v_avatar_url text := new.raw_user_meta_data->>'avatar_url';
begin
  update public.users
  set
    display_name = coalesce(display_name, nullif(v_full_name, '')),
    avatar_url = coalesce(avatar_url, v_avatar_url),
    updated_at = now()
  where id = new.id
    and (
      (display_name is null and nullif(v_full_name, '') is not null)
      or (avatar_url is null and v_avatar_url is distinct from avatar_url)
    );
  return new;
end;
$function$
;
