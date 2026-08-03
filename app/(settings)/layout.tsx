import { redirect } from "next/navigation";
import { getAuthedUser, getSupabaseServerClient } from "@/lib/data/session";
import { getStudySettings } from "@/lib/data/studySettings";
import { getUserProfile } from "@/lib/data/userProfile";
import { Header } from "@/app/components/shell/Header";
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
      <Header user={user} showBack />
      <div className="flex flex-col md:flex-row">
        <SettingsNav />
        <div className="md:max-w-[1000px] flex-1 px-5 pb-[90px] pt-5 pb-[90px] pt-5 md:px-10 md:pb-8 md:pt-8">{children}</div>
      </div>
    </div>
  );
}
