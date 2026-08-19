"use client";

import { useRequireOnboarded } from "@/lib/auth/useRequireOnboarded";
import { useUserProfile } from "@/lib/client-data/userProfile";
import { UserProfileProvider } from "@/lib/client-data/UserProfileContext";
import { StudyStatsProvider } from "@/lib/study/StudyStatsContext";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { Header } from "@/app/components/shell/Header";
import { MobileMenuProvider } from "@/app/components/shell/MobileMenuContext";
import { NavBar } from "@/app/components/shell/NavBar";
import { RippleBackground } from "@/app/components/shell/RippleBackground";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { ready, authReady, user: authUser } = useRequireOnboarded();
  // Gated on `authReady`, not `ready` -- runs in parallel with the study-settings fetch inside
  // useRequireOnboarded instead of waiting for it to finish first.
  const { data: profile, status: profileStatus, refetch } = useUserProfile(authReady ? authUser : null);

  if (!ready || profileStatus !== "loaded" || !profile) {
    return <FullScreenLoader />;
  }

  return (
    <UserProfileProvider profile={profile} refetch={refetch}>
      <StudyStatsProvider>
        <MobileMenuProvider>
          <RippleBackground />
          <div>
            <Header user={profile} />
            <div className="flex flex-col md:flex-row">
              <NavBar />
              <div className="flex-1 p-5">{children}</div>
            </div>
          </div>
        </MobileMenuProvider>
      </StudyStatsProvider>
    </UserProfileProvider>
  );
}
