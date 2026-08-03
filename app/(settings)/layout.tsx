import { redirect } from "next/navigation";
import { getAuthedUser, getSupabaseServerClient } from "@/lib/data/session";
import { getStudySettings } from "@/lib/data/studySettings";
import { getUserProfile } from "@/lib/data/userProfile";
import { SettingsHeader } from "@/app/components/shell/SettingsHeader";
import { SettingsNav } from "./SettingsNav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseServerClient();
  const authedUser = await getAuthedUser();

  // Independent of one another, so they run as one batch instead of settings blocking profile.
  const [settings, user] = await Promise.all([
    getStudySettings(supabase, authedUser.id),
    getUserProfile(supabase, authedUser.id),
  ]);
  if (!settings || !settings.onboarding_completed) {
    redirect("/onboarding");
  }

  return (
    <div>
      <SettingsHeader user={user} />
      <div className="mx-auto flex max-w-[1000px] flex-col gap-6 px-6 pb-[90px] pt-9 md:flex-row md:gap-10 md:pb-20">
        <SettingsNav />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
