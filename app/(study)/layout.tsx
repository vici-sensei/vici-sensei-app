"use client";

import { usePathname } from "next/navigation";
import { useRequireOnboarded } from "@/lib/auth/useRequireOnboarded";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { RippleBackground } from "@/app/components/shell/RippleBackground";
import { StudyOnboardingProvider } from "@/lib/study/StudyOnboardingContext";

// Gold on the summary screen (matches its "session complete" gold accents) --
// blue everywhere else in this route group.
const SUMMARY_RIPPLE_RGB = "255, 210, 0";

export default function StudyLayout({ children }: { children: React.ReactNode }) {
  const { ready, user, settings } = useRequireOnboarded();
  const pathname = usePathname();
  if (!ready || !user || !settings) return <FullScreenLoader />;
  return (
    <StudyOnboardingProvider user={user} settings={settings}>
      <RippleBackground speed={2.5} color={pathname === "/study/summary" ? SUMMARY_RIPPLE_RGB : undefined} />
      {children}
    </StudyOnboardingProvider>
  );
}
