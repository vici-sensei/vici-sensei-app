import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { createAdminClient, requireUser } from "../_shared/supabaseClients.ts";

Deno.serve(async (req) => {
  const preflight = handlePreflight(req);
  if (preflight) return preflight;

  const auth = await requireUser(req);
  if (auth instanceof Response) return auth;
  const { user } = auth;

  const body = await req.json().catch(() => ({}));
  const newIdentityId = typeof body.newIdentityId === "string" ? body.newIdentityId : null;
  if (!newIdentityId) {
    return jsonResponse(req, { error: "Missing newIdentityId." }, 400);
  }

  // Admin (service-role) client — required to read the full identity list with
  // confidence and to set auth.users.email without triggering the double-opt-in
  // confirmation flow (Google's own OAuth handshake already proved ownership).
  const admin = createAdminClient();

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
