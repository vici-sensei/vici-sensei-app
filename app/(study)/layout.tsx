import { redirect } from "next/navigation";
import { fetchServerOptional } from "@/lib/api/server";
import type { StudySettings } from "@/lib/types";

export default async function StudyLayout({ children }: { children: React.ReactNode }) {
  // See app/(shell)/layout.tsx — a settings row always exists after signup;
  // onboarding_completed is the real gate, not row existence.
  const settings = await fetchServerOptional<StudySettings>("/api/study-settings");
  if (!settings || !settings.onboarding_completed) {
    redirect("/onboarding");
  }

  return <>{children}</>;
}
