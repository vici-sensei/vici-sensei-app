"use client";

import { StaffLessons } from "@/app/components/lessons-staff/StaffLessons";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { useRequireAdmin } from "@/lib/auth/useRequireAdmin";

export default function AdminLessonsPage() {
  const { ready } = useRequireAdmin();
  if (!ready) return <Skeleton className="h-64 w-full" />;
  return <StaffLessons role="admin" />;
}
