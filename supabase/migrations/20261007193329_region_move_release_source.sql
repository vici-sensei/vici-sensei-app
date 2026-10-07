-- Scope: both live projects (EU-new zrgcullndfhouencqqqc + US-new wftwdbiqnlqsvgpeypmb), identical text. Never the frozen project.
--
-- Region move: the retired copy of a moved account must not keep the person's email or sign-in methods.
--
-- A region move retires the source-region account (public.users.pending_deletion_at +
-- retired_to_region, 30-day grace period) but used to leave its auth.users row untouched: same
-- email, same Google identities. For those 30 days that copy still answered to the person's old
-- credentials, and two things went wrong because of it:
--   * "Continue with Google" with an address the person no longer uses (after an email change or a
--     Google switch in the new region) found the retired copy by email, GoTrue's automatic linking
--     attached the new Google identity to it and signed the person into a dead account ("your
--     account moved to America") -- an address the D1 ledger had already released.
--   * public.users.email is unique, so the retired copy also blocked a new signup with that email in
--     the source region (handle_new_user would hit users_email_key).
--
-- region_move_release_source(user) turns a retired copy into an inert tombstone:
--   * email -> retired-<id>@moved.invalid on auth.users (on_auth_user_email_changed mirrors it to
--     public.users) and on its `email` identity -- .invalid is reserved (RFC 2606) and never delivers;
--   * every non-email identity (Google) is removed and app_metadata.providers recomputed;
--   * its one-time tokens are deleted and the leftover confirmation / recovery / email-change token
--     columns are blanked;
--   * its sessions (refresh tokens cascade) are deleted too, unless p_revoke_sessions is false. The
--     Worker passes false while the move is still running -- /continue authenticates with the source
--     session, so killing it before the move is marked completed could strand a move whose last
--     verification failed -- and calls again with true once the move is completed.
-- Only ever on an account that really is retired (public.users.retired_to_region is set) -- an active
-- account raises instead of being touched. Idempotent. The data rows stay, so the 30-day grace period
-- is unchanged; process-scheduled-deletions deletes the whole user by id and doesn't care about the email.
-- Executable by service_role only; the Worker calls it from the retire_source step.
--
-- region_move_unreleased_sources() lists retired copies that still hold a real email or a non-email
-- identity (a copy retired before this migration, or a retire_source that crashed halfway) -- the
-- Worker's weekly sweep logs them.

create or replace function public.region_move_release_source(p_user_id uuid, p_revoke_sessions boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_placeholder text := 'retired-' || p_user_id::text || '@moved.invalid';
  v_retired_to text;
  v_email text;
  v_email_released boolean := false;
  v_identities integer := 0;
  v_sessions integer := 0;
begin
  select u.email into v_email from auth.users u where u.id = p_user_id;
  if not found then
    raise exception 'region_move_release_source: no such user' using errcode = 'P0002';
  end if;

  select p.retired_to_region into v_retired_to from public.users p where p.id = p_user_id;
  if v_retired_to is null then
    raise exception 'region_move_release_source: user is not a retired copy' using errcode = '55000';
  end if;

  delete from auth.identities i where i.user_id = p_user_id and i.provider <> 'email';
  get diagnostics v_identities = row_count;

  update auth.identities i
     set identity_data = jsonb_set(i.identity_data, '{email}', to_jsonb(v_placeholder)),
         updated_at = now()
   where i.user_id = p_user_id
     and i.provider = 'email'
     and i.identity_data ->> 'email' is distinct from v_placeholder;

  if p_revoke_sessions then
    delete from auth.sessions s where s.user_id = p_user_id;
    get diagnostics v_sessions = row_count;
  end if;
  delete from auth.one_time_tokens t where t.user_id = p_user_id;

  v_email_released := v_email is distinct from v_placeholder;

  update auth.users u
     set email = v_placeholder,
         email_change = '',
         email_change_token_new = '',
         email_change_token_current = '',
         email_change_sent_at = null,
         email_change_confirm_status = 0,
         confirmation_token = '',
         recovery_token = '',
         reauthentication_token = '',
         raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
           'provider', 'email',
           'providers', coalesce((select jsonb_agg(distinct i.provider) from auth.identities i where i.user_id = u.id), '[]'::jsonb)
         ),
         updated_at = now()
   where u.id = p_user_id;

  return jsonb_build_object(
    'email_released', v_email_released,
    'identities_removed', v_identities,
    'sessions_removed', v_sessions
  );
end;
$$;

revoke all on function public.region_move_release_source(uuid, boolean) from public, anon, authenticated;
grant execute on function public.region_move_release_source(uuid, boolean) to service_role;

create or replace function public.region_move_unreleased_sources()
returns table (user_id uuid, real_email boolean, extra_identities integer)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id,
         a.email is distinct from 'retired-' || p.id::text || '@moved.invalid',
         (select count(*)::integer from auth.identities i where i.user_id = p.id and i.provider <> 'email')
    from public.users p
    join auth.users a on a.id = p.id
   where p.retired_to_region is not null
     and (
       a.email is distinct from 'retired-' || p.id::text || '@moved.invalid'
       or exists (select 1 from auth.identities i where i.user_id = p.id and i.provider <> 'email')
     );
$$;

revoke all on function public.region_move_unreleased_sources() from public, anon, authenticated;
grant execute on function public.region_move_unreleased_sources() to service_role;

notify pgrst, 'reload schema';
