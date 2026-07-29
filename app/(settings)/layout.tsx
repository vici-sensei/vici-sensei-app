import { redirect } from "next/navigation";
import { fetchServer, fetchServerOptional } from "@/lib/api/server";
import type { StudySettings, UserProfile } from "@/lib/types";
import { SettingsHeader } from "@/app/components/shell/SettingsHeader";
import { SettingsNav } from "./SettingsNav";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const settings = await fetchServerOptional<StudySettings>("/api/study-settings");
  if (!settings || !settings.onboarding_completed) {
    redirect("/onboarding");
  }

  const user = await fetchServer<UserProfile>("/api/user/me");

  return (
    <div>
      <SettingsHeader user={user} />
      <div className="mx-auto flex max-w-[1000px] flex-col gap-6 px-6 pb-20 pt-9 md:flex-row md:gap-10">
        <SettingsNav />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
