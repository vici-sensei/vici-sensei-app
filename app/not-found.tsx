"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";

export default function NotFound() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/");
  }, [router]);

  return <FullScreenLoader />;
}
