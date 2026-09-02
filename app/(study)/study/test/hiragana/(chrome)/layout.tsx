"use client";

import { useRequireOnboarded } from "@/lib/auth/useRequireOnboarded";
import { useUserProfile } from "@/lib/client-data/userProfile";
import { StudyStatsProvider } from "@/lib/study/StudyStatsContext";
import { StudySettingsProvider } from "@/lib/client-data/StudySettingsContext";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { Header } from "@/app/components/shell/Header";
import { MobileMenuProvider } from "@/app/components/shell/MobileMenuContext";
import { NavBar } from "@/app/components/shell/NavBar";

// The reading test is the one (study) route that keeps the header/navbar -- unlike the swipe-card
// session and its summary, it's a long scrolling page where losing the way back out (or to the
// rest of the app) would be disorienting. Its own summary screen stays chrome-less like
// /study/summary, which is why this lives in a (chrome) group scoped to just the test page
// instead of on the shared test/hiragana layout. Header already hides itself while the on-screen
// keyboard is open (see useKeyboardOpen); NavBar's sidebar is desktop-only (`hidden md:flex`), so
// there's nothing extra to hide for it on mobile.
export default function ReadingTestChromeLayout({ children }: { children: React.ReactNode }) {
  const {
    ready,
    authReady,
    user: authUser,
    settings: studySettings,
    status: studySettingsStatus,
    error: studySettingsError,
    refetch: refetchStudySettings,
  } = useRequireOnboarded();
  const { data: profile, status: profileStatus } = useUserProfile(authReady ? authUser : null);

  if (!ready || profileStatus !== "loaded" || !profile) {
    return <FullScreenLoader />;
  }

  return (
    <StudySettingsProvider
      data={studySettings}
      status={studySettingsStatus}
      error={studySettingsError}
      refetch={refetchStudySettings}
    >
      <StudyStatsProvider>
        <MobileMenuProvider>
          <div className="flex min-h-screen flex-col">
            <Header user={profile} />
            <div className="flex w-full flex-1">
              <NavBar />
              <main className="flex-1">{children}</main>
            </div>
          </div>
        </MobileMenuProvider>
      </StudyStatsProvider>
    </StudySettingsProvider>
  );
}
