-- Bidirectional sync of display_name/avatar_url between public.users and
-- auth.users.raw_user_meta_data ('full_name' / 'avatar_url' keys). Email is
-- intentionally NOT synced this direction (see 20260730_sync_auth_email_change.sql):
-- the login email may only change via supabase.auth.updateUser({ email }),
-- which requires confirmation, so public.users.email must stay a read-only
-- mirror. Each trigger guards with IS DISTINCT FROM against the value it's
-- about to write, so a round trip (public -> auth -> public) finds nothing
-- left to change on the second hop and stops there.

-- auth.users -> public.users
create or replace function public.handle_user_metadata_change()
 returns trigger
 language plpgsql
 security definer
as $function$
declare
  v_full_name text := new.raw_user_meta_data->>'full_name';
  v_avatar_url text := new.raw_user_meta_data->>'avatar_url';
begin
  update public.users
  set
    display_name = coalesce(nullif(v_full_name, ''), display_name),
    avatar_url = v_avatar_url,
    updated_at = now()
  where id = new.id
    and (
      (nullif(v_full_name, '') is not null and display_name is distinct from v_full_name)
      or avatar_url is distinct from v_avatar_url
    );
  return new;
end;
$function$
;

drop trigger if exists on_auth_user_metadata_changed on auth.users;

create trigger on_auth_user_metadata_changed
  after update of raw_user_meta_data on auth.users
  for each row
  execute function public.handle_user_metadata_change();

-- public.users -> auth.users
create or replace function public.handle_public_user_profile_change()
 returns trigger
 language plpgsql
 security definer
as $function$
begin
  update auth.users
  set raw_user_meta_data =
    coalesce(raw_user_meta_data, '{}'::jsonb)
      || jsonb_build_object('full_name', new.display_name)
      || jsonb_build_object('avatar_url', new.avatar_url)
  where id = new.id
    and (
      raw_user_meta_data->>'full_name' is distinct from new.display_name
      or raw_user_meta_data->>'avatar_url' is distinct from new.avatar_url
    );
  return new;
end;
$function$
;

drop trigger if exists on_public_user_profile_changed on public.users;

create trigger on_public_user_profile_changed
  after update of display_name, avatar_url on public.users
  for each row
  execute function public.handle_public_user_profile_change();
