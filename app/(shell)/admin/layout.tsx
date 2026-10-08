"use client";

import { useRequireAdmin } from "@/lib/auth/useRequireAdmin";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";

/** Gate for every /admin page: nothing under it mounts until the signed-in user is confirmed as an
 * admin (anyone else is sent to /dashboard by useRequireAdmin), so the pages themselves can fetch
 * their data unconditionally. The layout stays mounted across /admin navigations, so the check runs
 * once per visit to the section instead of once per page. */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { ready } = useRequireAdmin();
  if (!ready) return <FullScreenLoader />;
  return <>{children}</>;
}
