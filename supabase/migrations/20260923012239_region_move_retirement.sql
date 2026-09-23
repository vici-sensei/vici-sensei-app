-- Self-service region move, part 1 (schema). Scope: EU-new + US-new BOTH -- never the frozen
-- old/live project (hmbemylaqnkiamvhcdcd gets no new migrations ever, see CLAUDE.md).
--
-- Distinguishes "retired because a region move copied this account elsewhere" from an ordinary
-- delete-account grace period, both of which otherwise share pending_deletion_at. Without this,
-- cancel_pending_account_deletion() (called unconditionally after any successful login, see
-- app/auth/callback/page.tsx) would silently "reactivate" a moved account the moment its owner
-- logs back into the OLD region by accident (stale bookmark, another device's localStorage still
-- pointing at the old region) -- reviving a stale duplicate the user has no reason to expect.

ALTER TABLE public.users
  ADD COLUMN retired_to_region text CHECK (retired_to_region IN ('eu', 'us'));

CREATE OR REPLACE FUNCTION public.cancel_pending_account_deletion() RETURNS boolean
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
declare
  reactivated boolean := false;
begin
  update public.users
  set pending_deletion_at = null
  where id = auth.uid()
    and pending_deletion_at is not null
    and retired_to_region is null
  returning true into reactivated;

  return coalesce(reactivated, false);
end;
$$;

-- Lets a signed-in-but-RLS-blocked user (pending_deletion_at IS NOT NULL, see the SELECT/UPDATE
-- policies on public.users) find out THEY were the one who moved, and where to -- without this,
-- app/auth/callback/page.tsx has no way to distinguish "this account was moved" from any other
-- reason RLS might be blocking their own profile read.
CREATE FUNCTION public.check_account_moved() RETURNS text
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select retired_to_region from public.users where id = auth.uid();
$$;

GRANT EXECUTE ON FUNCTION public.check_account_moved() TO authenticated;
