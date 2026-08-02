import { redirect } from "next/navigation";
import { getAuthedUser, getSupabaseServerClient } from "@/lib/data/session";
import { getStudySettings } from "@/lib/data/studySettings";
import { getUserProfile } from "@/lib/data/userProfile";
import { getStudyStats } from "@/lib/data/studyStats";
import { cardsRemainingToday } from "@/lib/study/stats";
import { Header } from "@/app/components/shell/Header";
import { SidebarDesktop } from "@/app/components/shell/SidebarDesktop";
import { BottomNavMobile } from "@/app/components/shell/BottomNavMobile";
import { OfflineBanner } from "@/app/components/shell/OfflineBanner";

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseServerClient();
  const authedUser = await getAuthedUser();

  // Settings, profile, and stats are independent of one another (each only needs the user id),
  // so they run as one batch instead of settings blocking the other two — the redirect check
  // below just runs after all three have landed. React.cache means this is a no-op re-fetch
  // for any page underneath that also asks for the same data.
  const [settings, user, stats] = await Promise.all([
    getStudySettings(supabase, authedUser.id),
    getUserProfile(supabase, authedUser.id),
    getStudyStats(supabase, authedUser.id),
  ]);

  // A user_study_settings row is created for every user at signup (handle_new_user trigger),
  // so a missing row here is only a defensive fallback — the real "needs onboarding" signal is
  // the onboarding_completed flag on that row.
  if (!settings || !settings.onboarding_completed) {
    redirect("/onboarding");
  }

  const studyDisabled = cardsRemainingToday(stats) === 0;

  return (
    <div className="flex min-h-screen flex-col">
      <Header user={user} />
      <div className="flex w-full flex-1">
        <SidebarDesktop studyDisabled={studyDisabled} />
        <main className="max-w-none flex-1 px-5 pb-[90px] pt-5 md:max-w-[1000px] md:px-10 md:pb-8 md:pt-8">
          <OfflineBanner />
          {children}
        </main>
      </div>
      <BottomNavMobile studyDisabled={studyDisabled} />
    </div>
  );
}
