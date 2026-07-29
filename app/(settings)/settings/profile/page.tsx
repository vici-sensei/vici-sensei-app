import { fetchServer } from "@/lib/api/server";
import type { UserProfile } from "@/lib/types";
import { ProfileSettingsForm } from "./ProfileSettingsForm";

export default async function SettingsProfilePage() {
  const user = await fetchServer<UserProfile>("/api/user/me");
  return <ProfileSettingsForm initial={user} />;
}
