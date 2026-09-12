"use client";

import { useRequireOnboarded } from "@/lib/auth/useRequireOnboarded";
import { useUserProfile } from "@/lib/client-data/userProfile";
import { StudyStatsProvider } from "@/lib/study/StudyStatsContext";
import { StudySettingsProvider } from "@/lib/client-data/StudySettingsContext";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";

// The reading test page stays chrome-less -- no shared header, and no header-like bar of its own
// either; its "x" exit button (ReadingTestCloseButton) lives inline in the page content instead,
// same focused, distraction-free flow as /study and /study/summary. This layout still needs the
// StudySettingsProvider/StudyStatsProvider stack the shared (study) layout would otherwise
// supply (page.tsx pulls from them via useStudyOnboarding etc.), which is why this lives in its
// own (chrome) group instead of just dropping the layout override entirely. Shared verbatim by
// both /study/test/hiragana and /study/test/katakana -- neither needs anything script-specific.
export function ReadingTestChromeLayout({ children }: { children: React.ReactNode }) {
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
      <StudyStatsProvider>{children}</StudyStatsProvider>
    </StudySettingsProvider>
  );
}
