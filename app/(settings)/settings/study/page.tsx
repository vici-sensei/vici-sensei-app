import { fetchServer } from "@/lib/api/server";
import type { StudySettings } from "@/lib/types";
import { StudySettingsForm } from "./StudySettingsForm";

export default async function SettingsStudyPage() {
  const settings = await fetchServer<StudySettings>("/api/study-settings");
  return <StudySettingsForm initial={settings} />;
}
