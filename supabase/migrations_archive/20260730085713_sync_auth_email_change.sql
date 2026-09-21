-- Keeps public.users.email in sync once a Supabase Auth email change
-- (supabase.auth.updateUser({ email })) is confirmed. Google sign-in does not
-- overwrite auth.users.email on later logins — identity matching is by
-- provider id, not email — so this only fires on a deliberate email change.

create or replace function public.handle_user_email_change()
 returns trigger
 language plpgsql
 security definer
as $function$
BEGIN
  IF new.email IS DISTINCT FROM old.email THEN
    UPDATE public.users
    SET email = new.email, updated_at = now()
    WHERE id = new.id;
  END IF;
  RETURN new;
END;
$function$
;

drop trigger if exists on_auth_user_email_changed on auth.users;

create trigger on_auth_user_email_changed
  after update on auth.users
  for each row
  execute function public.handle_user_email_change();
