-- Google (and any other OAuth provider) re-sends raw_user_meta_data on every
-- login, which previously overwrote display_name/avatar_url in public.users
-- even after the user had customized them in the app (uploaded a photo,
-- edited their name). handle_new_user() already seeds both fields at signup
-- from the provider's claims, so this trigger only needs to fill them in
-- when they're still unset -- not re-sync them on every subsequent login.
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
