"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { FaLock } from "react-icons/fa6";
import { StatusPage } from "@/app/components/auth/StatusNotice";

export default function SessionExpiredPage() {
  const router = useRouter();

  useEffect(() => {
    const timeout = setTimeout(() => router.replace("/login"), 1200);
    return () => clearTimeout(timeout);
  }, [router]);

  return (
    <StatusPage
      icon={FaLock}
      tone="blue"
      title="Your session has expired"
      actions={
        <div className="flex items-center justify-center gap-2.5 text-[0.9rem] font-bold text-text-muted">
          <span className="inline-block h-[18px] w-[18px] shrink-0 animate-spin rounded-full border-[2.5px] border-white/35 border-t-white" />
          Redirecting to login...
        </div>
      }
    >
      <p>Please sign in again to continue.</p>
    </StatusPage>
  );
}
