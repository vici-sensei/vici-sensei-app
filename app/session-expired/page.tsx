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
    <div className="error-screen">
      <div className="error-card">
        <div className="expired-icon-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
        </div>
        <h1>Your session has expired</h1>
        <p className="subtitle">Please sign in again to continue.</p>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 10,
            color: "var(--color-text-muted)",
            fontSize: "0.9rem",
            fontWeight: 700,
          }}
        >
          <span className="spinner" style={{ display: "inline-block" }} /> Redirecting to login...
        </div>
      </div>
    </div>
  );
}
