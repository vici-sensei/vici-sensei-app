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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-[60px] text-center before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_50%_20%,rgb(255_74_90/0.1)_0%,transparent_55%)]">
      <div className="relative w-full max-w-[440px]">
        <div className="mx-auto mb-5.5 flex h-16 w-16 items-center justify-center rounded-full border border-accent-red/30 bg-accent-red/10">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-7 w-7 text-accent-red">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h1 className="mb-2.5 text-2xl font-extrabold">Something went wrong</h1>
        <p className="mb-7 text-base leading-[1.6] text-text-muted">
          An unexpected error occurred while loading this page. Your data is safe — try again in a moment.
        </p>
        <Button onClick={() => reset()}>Retry</Button>
        {error.digest && <div className="mt-4.5 font-mono text-[0.78rem] text-text-muted">Error reference: {error.digest}</div>}
      </div>
    </div>
  );
}
