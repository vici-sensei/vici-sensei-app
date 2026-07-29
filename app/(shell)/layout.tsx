import { redirect } from "next/navigation";
import { fetchServer, fetchServerOptional } from "@/lib/api/server";
import type { StudySettings, UserProfile } from "@/lib/types";
import { Header } from "@/app/components/shell/Header";
import { SidebarDesktop } from "@/app/components/shell/SidebarDesktop";
import { BottomNavMobile } from "@/app/components/shell/BottomNavMobile";
import { OfflineBanner } from "@/app/components/shell/OfflineBanner";

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  // A user_study_settings row is created for every user at signup (handle_new_user trigger),
  // so a 404 here is only a defensive fallback — the real "needs onboarding" signal is the
  // onboarding_completed flag on that row.
  const settings = await fetchServerOptional<StudySettings>("/api/study-settings");
  if (!settings || !settings.onboarding_completed) {
    redirect("/onboarding");
  }

  const user = await fetchServer<UserProfile>("/api/user/me");

  return (
    <div className="flex min-h-screen flex-col">
      <Header user={user} />
      <div className="flex w-full flex-1">
        <SidebarDesktop />
        <main className="max-w-none flex-1 px-5 pb-[90px] pt-5 md:max-w-[1000px] md:px-10 md:pb-8 md:pt-8">
          <OfflineBanner />
          {children}
        </main>
      </div>
      <BottomNavMobile />
    </div>
  );
}
