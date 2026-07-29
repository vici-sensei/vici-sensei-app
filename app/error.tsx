"use client";

import { Button } from "@/app/components/ui/Button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="error-screen">
      <div className="error-card">
        <div className="error-icon-wrap">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h1>Something went wrong</h1>
        <p className="subtitle">
          An unexpected error occurred while loading this page. Your data is safe — try again in a moment.
        </p>
        <Button onClick={() => reset()}>Retry</Button>
        {error.digest && <div className="error-detail">Error reference: {error.digest}</div>}
      </div>
    </div>
  );
}
