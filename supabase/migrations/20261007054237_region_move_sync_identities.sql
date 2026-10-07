-- Scope: both live projects (EU-new zrgcullndfhouencqqqc + US-new wftwdbiqnlqsvgpeypmb), identical text. Never the frozen project.
--
-- Self-service region move: carry the account's linked sign-in identities (Google) to the new project.
--
-- The Worker recreates the account in the other project with the Admin API, and createUser only ever
-- makes the `email` identity -- the linked Google identity stayed behind on the retired account, so
-- "Continue with Google" could no longer find the account in its new region. GoTrue has no Admin
-- endpoint that links an identity (linkIdentity() needs the person's own OAuth round trip), and
-- auth.identities is not reachable through PostgREST, so the Worker calls this function with the
-- service_role key instead.
--
-- region_move_sync_identities(user, identities) makes the user's NON-email identities in THIS project
-- equal to `p_identities` (a JSON array read from the source project's Admin API:
-- [{provider, provider_id, identity_data, last_sign_in_at, created_at}, ...]):
--   * missing ones are inserted verbatim (identity_data is the provider's own profile, it has nothing
--     tied to the old user id);
--   * ones already linked to this user are left alone (a move back onto a retired copy of the account
--     finds them in place);
--   * ones this user has but the source no longer has are removed (the retired copy may still carry a
--     Google account the person unlinked or switched away from in the meantime);
--   * one that belongs to a DIFFERENT user in this project is skipped and counted under `taken`
--     (someone already signed up here with that Google account) -- never reassigned.
-- `email` identities are never touched, and app_metadata.providers is recomputed when anything
-- changed. Idempotent, so a resumed move can run it again. Returns {linked, kept, removed, taken}.
--
-- The on_auth_identity_require_gmail trigger still runs on the inserts (a Google identity must be an
-- @gmail.com one). Executable by service_role only.

create or replace function public.region_move_sync_identities(p_user_id uuid, p_identities jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_wanted record;
  v_owner uuid;
  v_linked integer := 0;
  v_kept integer := 0;
  v_removed integer := 0;
  v_taken integer := 0;
begin
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'region_move_sync_identities: no such user' using errcode = 'P0002';
  end if;
  if p_identities is null or jsonb_typeof(p_identities) <> 'array' then
    raise exception 'region_move_sync_identities: p_identities must be a JSON array' using errcode = '22023';
  end if;

  delete from auth.identities i
   where i.user_id = p_user_id
     and i.provider <> 'email'
     and not exists (
       select 1
         from jsonb_to_recordset(p_identities) as w(provider text, provider_id text)
        where w.provider = i.provider and w.provider_id = i.provider_id
     );
  get diagnostics v_removed = row_count;

  for v_wanted in
    select w.provider, w.provider_id, w.identity_data, w.last_sign_in_at, w.created_at
      from jsonb_to_recordset(p_identities)
        as w(provider text, provider_id text, identity_data jsonb, last_sign_in_at timestamptz, created_at timestamptz)
     where w.provider <> 'email' and w.provider_id is not null and w.identity_data is not null
  loop
    select i.user_id into v_owner
      from auth.identities i
     where i.provider = v_wanted.provider and i.provider_id = v_wanted.provider_id;

    if found then
      if v_owner = p_user_id then
        v_kept := v_kept + 1;
      else
        v_taken := v_taken + 1;
      end if;
    else
      insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (
        v_wanted.provider_id, p_user_id, v_wanted.identity_data, v_wanted.provider,
        v_wanted.last_sign_in_at, coalesce(v_wanted.created_at, now()), now()
      );
      v_linked := v_linked + 1;
    end if;
  end loop;

  if v_linked > 0 or v_removed > 0 then
    update auth.users u
       set raw_app_meta_data = coalesce(u.raw_app_meta_data, '{}'::jsonb) || jsonb_build_object(
             'providers',
             coalesce((select jsonb_agg(distinct i.provider) from auth.identities i where i.user_id = u.id), '[]'::jsonb)
           )
     where u.id = p_user_id;
  end if;

  return jsonb_build_object('linked', v_linked, 'kept', v_kept, 'removed', v_removed, 'taken', v_taken);
end;
$$;

revoke all on function public.region_move_sync_identities(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.region_move_sync_identities(uuid, jsonb) to service_role;

notify pgrst, 'reload schema';
