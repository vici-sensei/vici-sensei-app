import { getAuthedUser, getSupabaseServerClient } from "@/lib/data/session";
import { getUserProfile } from "@/lib/data/userProfile";
import { ProfileSettingsForm } from "./ProfileSettingsForm";

export default async function SettingsProfilePage() {
  const supabase = await getSupabaseServerClient();
  const authedUser = await getAuthedUser();
  // Cached per-request (React.cache) — the settings layout above this page already fetched
  // the profile, so this reuses that result instead of re-querying.
  const user = await getUserProfile(supabase, authedUser.id);
  return <ProfileSettingsForm initial={user} />;
}
