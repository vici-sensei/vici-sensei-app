import { getAuthedUser, getSupabaseServerClient } from "@/lib/data/session";
import { getUserProfile } from "@/lib/data/userProfile";
import { BillingPanel } from "./BillingPanel";

export default async function SettingsBillingPage() {
  const supabase = await getSupabaseServerClient();
  const authedUser = await getAuthedUser();
  // Cached per-request (React.cache) — the settings layout above this page already fetched
  // the profile, so this reuses that result instead of re-querying.
  const user = await getUserProfile(supabase, authedUser.id);
  return <BillingPanel isPremium={user.is_premium} userId={authedUser.id} email={user.email} />;
}
