import { redirect } from "next/navigation";
import { getAuthedUser, getSupabaseServerClient } from "@/lib/data/session";
import { getStudySettings } from "@/lib/data/studySettings";
import { StudySettingsForm } from "./StudySettingsForm";

export default async function SettingsStudyPage() {
  const supabase = await getSupabaseServerClient();
  const user = await getAuthedUser();
  // Cached per-request (React.cache) — the settings layout above this page already fetched
  // settings, so this reuses that result instead of re-querying.
  const settings = await getStudySettings(supabase, user.id);
  if (!settings) redirect("/onboarding");
  return <StudySettingsForm initial={settings} />;
}
