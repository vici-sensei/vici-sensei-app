"use client";

import { useRequireOnboarded } from "@/lib/auth/useRequireOnboarded";
import { useUserProfile } from "@/lib/client-data/userProfile";
import { UserProfileProvider } from "@/lib/client-data/UserProfileContext";
import { StudyStatsProvider } from "@/lib/study/StudyStatsContext";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { Header } from "@/app/components/shell/Header";
import { MobileMenuProvider } from "@/app/components/shell/MobileMenuContext";
import { NavBar } from "@/app/components/shell/NavBar";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { ready, user: authUser } = useRequireOnboarded();
  const { data: profile, status: profileStatus, refetch } = useUserProfile(ready ? authUser : null);

  if (!ready || profileStatus !== "loaded" || !profile) {
    return <FullScreenLoader />;
  }

  return (
    <UserProfileProvider profile={profile} refetch={refetch}>
      <StudyStatsProvider>
        <MobileMenuProvider>
          <div>
            <Header user={profile} />
            <div className="flex flex-col md:flex-row">
              <NavBar />
              <div className="md:max-w-[1000px] flex-1 px-5 pb-8 pt-5 md:px-10 md:pb-8 md:pt-8">{children}</div>
            </div>
          </div>
        </MobileMenuProvider>
      </StudyStatsProvider>
    </UserProfileProvider>
  );
}
