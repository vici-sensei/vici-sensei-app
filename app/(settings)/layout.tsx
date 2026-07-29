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
      <div className="settings-body">
        <SettingsNav />
        <div className="settings-pane">{children}</div>
      </div>
    </div>
  );
}
