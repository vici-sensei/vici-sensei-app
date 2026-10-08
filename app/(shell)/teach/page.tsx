"use client";

import { StaffLessons } from "@/app/components/lessons-staff/StaffLessons";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { useRequireStaff } from "@/lib/auth/useStaffRole";

/** The teachers' page: their classes, lessons and students. Admins who also teach get the same panel
 * with every class (the admin panel has the same lessons and more). */
export default function TeachPage() {
  const { role } = useRequireStaff();
  if (!role) return <Skeleton className="h-64 w-full" />;
  return <StaffLessons role={role} />;
}
