"use client";

import { useEffect } from "react";
import "./globals.css";
import { Button } from "@/app/components/ui/Button";
import { FullScreenMessage } from "@/app/components/ui/FullScreenMessage";
import { FaArrowRotateRight } from "react-icons/fa6";
import { logClientError } from "@/lib/client-data/errorLog";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void logClientError({ source: "global_error_boundary", error, digest: error.digest });
  }, [error]);

  return (
    <html lang="en" className="antialiased">
      <body>
        <FullScreenMessage
          title="This page hit a snag"
          actions={
            <Button variant="secondary" size="sm" onClick={() => reset()}>
              <FaArrowRotateRight className="h-3.5 w-3.5" />
              Try again
            </Button>
          }
          footer={error.digest && <div className="mt-4 font-mono text-[0.72rem] text-text-muted/70">Ref: {error.digest}</div>}
        >
          Nothing was lost — you can try reloading.
        </FullScreenMessage>
      </body>
    </html>
  );
}
