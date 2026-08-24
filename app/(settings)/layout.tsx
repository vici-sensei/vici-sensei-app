"use client";

import { useRequireOnboarded } from "@/lib/auth/useRequireOnboarded";
import { useUserProfile } from "@/lib/client-data/userProfile";
import { UserProfileProvider } from "@/lib/client-data/UserProfileContext";
import { StudySettingsProvider } from "@/lib/client-data/StudySettingsContext";
import { StudyStatsProvider } from "@/lib/study/StudyStatsContext";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { Header } from "@/app/components/shell/Header";
import { MobileMenuProvider } from "@/app/components/shell/MobileMenuContext";
import { NavBar } from "@/app/components/shell/NavBar";
import { RippleBackground } from "@/app/components/shell/RippleBackground";
import type { UserProfile } from "@/lib/types";

// Shown (via UserProfileContext's `loaded: false`) until the real row loads -- lets the shell
// and its pages render their final layout immediately instead of blocking on a full-screen
// loader. Pages lock whatever controls this would otherwise misrepresent and show skeleton
// placeholders for fields (name, country, email) that have no sensible neutral value.
const PLACEHOLDER_PROFILE: UserProfile = {
  email: "",
  display_name: "",
  avatar_url: null,
  country: null,
  show_country_on_leaderboard: true,
  is_premium: false,
  stripe_customer_id: null,
  created_at: "",
};

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const {
    ready,
    authReady,
    user: authUser,
    settings: studySettings,
    status: studySettingsStatus,
    error: studySettingsError,
    refetch: refetchStudySettings,
  } = useRequireOnboarded();
  // Gated on `authReady`, not `ready` -- runs in parallel with the study-settings fetch inside
  // useRequireOnboarded instead of waiting for it to finish first.
  const { data: profile, status: profileStatus, refetch } = useUserProfile(authReady ? authUser : null);

  if (!ready) {
    return <FullScreenLoader />;
  }

  const loaded = profileStatus === "loaded" && Boolean(profile);
  const displayProfile = profile ?? PLACEHOLDER_PROFILE;

  return (
    <StudySettingsProvider
      data={studySettings}
      status={studySettingsStatus}
      error={studySettingsError}
      refetch={refetchStudySettings}
    >
      <UserProfileProvider profile={displayProfile} loaded={loaded} refetch={refetch}>
        <StudyStatsProvider>
          <MobileMenuProvider>
            <RippleBackground />
            <div>
              <Header user={displayProfile} loaded={loaded} />
              <div className="flex flex-col md:flex-row">
                <NavBar />
                <div className="flex-1 p-5">{children}</div>
              </div>
            </div>
          </MobileMenuProvider>
        </StudyStatsProvider>
      </UserProfileProvider>
    </StudySettingsProvider>
  );
}
