import { fetchServer } from "@/lib/api/server";
import type { UserProfile } from "@/lib/types";
import { BillingPanel } from "./BillingPanel";

export default async function SettingsBillingPage() {
  const user = await fetchServer<UserProfile>("/api/user/me");
  return <BillingPanel isPremium={user.is_premium} />;
}
