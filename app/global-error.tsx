"use client";

import "./globals.css";
import { Button } from "@/app/components/ui/Button";
import { FaArrowRotateRight } from "react-icons/fa6";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="antialiased">
      <body>
        <div className="flex min-h-screen items-center justify-center px-6 py-[60px] text-center">
          <div className="w-full max-w-[380px]">
            <h1 className="mb-2 text-lg font-bold text-white">This page hit a snag</h1>
            <p className="mb-6 text-[0.9rem] leading-[1.6] text-text-muted">
              Nothing was lost — you can try reloading.
            </p>
            <Button variant="secondary" size="sm" onClick={() => reset()}>
              <FaArrowRotateRight className="h-3.5 w-3.5" />
              Try again
            </Button>
            {error.digest && <div className="mt-4 font-mono text-[0.72rem] text-text-muted/70">Ref: {error.digest}</div>}
          </div>
        </div>
      </body>
    </html>
  );
}
