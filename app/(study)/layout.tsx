import { redirect } from "next/navigation";
import { getAuthedUser, getSupabaseServerClient } from "@/lib/data/session";
import { getStudySettings } from "@/lib/data/studySettings";

export default async function StudyLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseServerClient();
  const user = await getAuthedUser();

  // See app/(shell)/layout.tsx — a settings row always exists after signup;
  // onboarding_completed is the real gate, not row existence.
  const settings = await getStudySettings(supabase, user.id);
  if (!settings || !settings.onboarding_completed) {
    redirect("/onboarding");
  }

  return <>{children}</>;
}
