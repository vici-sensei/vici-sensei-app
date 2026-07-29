"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export default function SessionExpiredPage() {
  const router = useRouter();

  useEffect(() => {
    const timeout = setTimeout(() => router.replace("/login"), 1200);
    return () => clearTimeout(timeout);
  }, [router]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-[60px] text-center before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_50%_20%,rgb(255_74_90/0.1)_0%,transparent_55%)]">
      <div className="relative w-full max-w-[440px]">
        <div className="mx-auto mb-5.5 flex h-16 w-16 items-center justify-center rounded-full border border-accent-blue/30 bg-accent-blue/10">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-6.5 w-6.5 text-accent-blue">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h1 className="mb-2.5 text-2xl font-extrabold">Your session has expired</h1>
        <p className="mb-7 text-base leading-[1.6] text-text-muted">Please sign in again to continue.</p>
        <div className="flex items-center justify-center gap-2.5 text-[0.9rem] font-bold text-text-muted">
          <span className="inline-block h-[18px] w-[18px] shrink-0 animate-spin rounded-full border-[2.5px] border-white/35 border-t-white" />
          Redirecting to login...
        </div>
      </div>
    </div>
  );
}
