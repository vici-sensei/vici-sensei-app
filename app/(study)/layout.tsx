"use client";

import { useRequireOnboarded } from "@/lib/auth/useRequireOnboarded";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { StudyOnboardingProvider } from "@/lib/study/StudyOnboardingContext";

export default function StudyLayout({ children }: { children: React.ReactNode }) {
  const { ready, user, settings } = useRequireOnboarded();
  if (!ready || !user || !settings) return <FullScreenLoader />;
  return (
    <StudyOnboardingProvider user={user} settings={settings}>
      {children}
    </StudyOnboardingProvider>
  );
}
