"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";

export default function RootPage() {
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authed") router.replace("/dashboard");
    else if (status === "anon") router.replace("/login");
  }, [status, router]);

  return <FullScreenLoader />;
}
