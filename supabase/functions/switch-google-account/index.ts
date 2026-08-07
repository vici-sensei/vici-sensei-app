import { createClient } from "jsr:@supabase/supabase-js@2";
import { handlePreflight, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  // User-scoped client (RLS applies) to identify the caller.
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: req.headers.get("Authorization")! } },
  });

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return jsonResponse(req, { error: "You are not logged in. Please log in." }, 401);
  }

  const body = await req.json().catch(() => ({}));
  const newIdentityId = typeof body.newIdentityId === "string" ? body.newIdentityId : null;
  if (!newIdentityId) {
    return jsonResponse(req, { error: "Missing newIdentityId." }, 400);
  }

  // Admin (service-role) client — required to read the full identity list with
  // confidence and to set auth.users.email without triggering the double-opt-in
  // confirmation flow (Google's own OAuth handshake already proved ownership).
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: adminUser, error: getUserError } = await admin.auth.admin.getUserById(user.id);
  if (getUserError || !adminUser.user) {
    return jsonResponse(req, { error: getUserError?.message ?? "Could not load your account." }, 500);
  }

  const identity = adminUser.user.identities?.find(
    (i) => i.identity_id === newIdentityId && i.provider === "google"
  );
  if (!identity) {
    return jsonResponse(req, { error: "That Google account isn't linked to your profile." }, 400);
  }

  const newEmail = identity.identity_data?.email;
  if (typeof newEmail !== "string" || !newEmail) {
    return jsonResponse(req, { error: "That Google account has no email address." }, 400);
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
    email: newEmail,
    email_confirm: true,
  });
  if (updateError) {
    return jsonResponse(req, { error: updateError.message }, 500);
  }

  return jsonResponse(req, { email: newEmail });
});
