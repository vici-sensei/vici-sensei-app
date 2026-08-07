-- Restricts every account to a @gmail.com address, at the source:
-- a BEFORE trigger on auth.users blocks sign-up (INSERT) and email changes
-- (UPDATE) for any other domain, before handle_new_user() / the email-sync
-- triggers ever run. The CHECK on public.users is a second line of defense
-- for any write that reaches that table by another path (service role, RPC).

create or replace function public.enforce_gmail_email()
 returns trigger
 language plpgsql
as $function$
begin
  if TG_OP = 'UPDATE' and new.email is not distinct from old.email then
    return new;
  end if;

  if new.email !~* '^[^@\s]+@gmail\.com$' then
    raise exception 'Only @gmail.com email addresses are allowed';
  end if;

  return new;
end;
$function$
;

drop trigger if exists on_auth_user_require_gmail on auth.users;

create trigger on_auth_user_require_gmail
  before insert or update on auth.users
  for each row
  execute function public.enforce_gmail_email();

alter table public.users
  add constraint users_email_gmail_check check (email ~* '^[^@\s]+@gmail\.com$');
