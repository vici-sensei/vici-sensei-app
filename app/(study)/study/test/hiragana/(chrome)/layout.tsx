"use client";

import { useRequireOnboarded } from "@/lib/auth/useRequireOnboarded";
import { useUserProfile } from "@/lib/client-data/userProfile";
import { StudyStatsProvider } from "@/lib/study/StudyStatsContext";
import { StudySettingsProvider } from "@/lib/client-data/StudySettingsContext";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { ReadingTestCloseHeader } from "@/app/components/readingTest/ReadingTestCloseHeader";

// The reading test page stays chrome-less other than its own "x" close button -- a focused,
// distraction-free flow like /study and /study/summary. It still needs the
// StudySettingsProvider/StudyStatsProvider stack the shared (study) layout would otherwise
// supply (page.tsx pulls from them via useStudyOnboarding etc.), which is why this lives in its
// own (chrome) group instead of just dropping the layout override entirely.
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
        <div className="flex min-h-screen flex-col">
          <ReadingTestCloseHeader />
          <main className="flex-1">{children}</main>
        </div>
      </StudyStatsProvider>
    </StudySettingsProvider>
  );
}
