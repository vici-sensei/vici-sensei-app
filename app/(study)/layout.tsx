"use client";

import { useRequireOnboarded } from "@/lib/auth/useRequireOnboarded";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";

export default function StudyLayout({ children }: { children: React.ReactNode }) {
  const { ready } = useRequireOnboarded();
  if (!ready) return <FullScreenLoader />;
  return <>{children}</>;
}
