import { redirect } from "next/navigation";
import { getAuthedUser, getSupabaseServerClient } from "@/lib/data/session";
import { getStudySettings } from "@/lib/data/studySettings";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseServerClient();
  const user = await getAuthedUser();
  const settings = await getStudySettings(supabase, user.id);

  if (settings?.onboarding_completed) {
    redirect("/dashboard");
  }

  return <>{children}</>;
}
