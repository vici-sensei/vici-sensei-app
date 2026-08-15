"use client";

import { useRequireOnboarded } from "@/lib/auth/useRequireOnboarded";
import { useUserProfile } from "@/lib/client-data/userProfile";
import { UserProfileProvider } from "@/lib/client-data/UserProfileContext";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { Header } from "@/app/components/shell/Header";
import { SettingsNav } from "./SettingsNav";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { ready, user: authUser } = useRequireOnboarded();
  const { data: profile, status: profileStatus, refetch } = useUserProfile(ready ? authUser : null);

  if (!ready || profileStatus !== "loaded" || !profile) {
    return <FullScreenLoader />;
  }

  return (
    <UserProfileProvider profile={profile} refetch={refetch}>
      <div>
        <Header user={profile} showBack />
        <div className="flex flex-col md:flex-row">
          <SettingsNav />
          <div className="md:max-w-[1000px] flex-1 px-5 pb-[90px] pt-5 pb-[90px] pt-5 md:px-10 md:pb-8 md:pt-8">{children}</div>
        </div>
      </div>
    </UserProfileProvider>
  );
}
