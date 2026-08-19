"use client";

import { useRequireOnboarded } from "@/lib/auth/useRequireOnboarded";
import { useUserProfile } from "@/lib/client-data/userProfile";
import { StudyStatsProvider } from "@/lib/study/StudyStatsContext";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { Header } from "@/app/components/shell/Header";
import { MobileMenuProvider } from "@/app/components/shell/MobileMenuContext";
import { NavBar } from "@/app/components/shell/NavBar";
import { OfflineBanner } from "@/app/components/shell/OfflineBanner";

export default function ShellLayout({ children }: { children: React.ReactNode }) {
  const { ready, authReady, user: authUser } = useRequireOnboarded();
  // Gated on `authReady`, not `ready` -- this fires as soon as we have a confirmed user, in
  // parallel with the study-settings fetch inside useRequireOnboarded, instead of waiting for
  // settings + onboarding to resolve first.
  const { data: profile, status: profileStatus } = useUserProfile(authReady ? authUser : null);

  if (!ready || profileStatus !== "loaded" || !profile) {
    return <FullScreenLoader />;
  }

  return (
    // Client-side navigations keep this layout mounted, so StudyStatsProvider's poll persists
    // across pages that share it instead of restarting on every navigation.
    <StudyStatsProvider>
      <MobileMenuProvider>
        <div className="flex min-h-screen flex-col">
          <Header user={profile} />
          <div className="flex w-full flex-1">
            <NavBar />
            <main className="md:max-w-[1000px] flex-1 px-5 pb-8 pt-5 md:px-10 md:pb-8 md:pt-8">
              <OfflineBanner />
              {children}
            </main>
          </div>
        </div>
      </MobileMenuProvider>
    </StudyStatsProvider>
  );
}
