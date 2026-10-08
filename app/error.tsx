"use client";

import { useEffect } from "react";
import Link from "next/link";
import { Button, buttonClasses } from "@/app/components/ui/Button";
import { FullScreenMessage } from "@/app/components/ui/FullScreenMessage";
import { FaArrowRotateRight, FaHouse } from "react-icons/fa6";
import { logClientError } from "@/lib/client-data/errorLog";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void logClientError({ source: "react_error_boundary", error, digest: error.digest });
  }, [error]);

  return (
    <FullScreenMessage
      title="This page hit a snag"
      actions={
        <>
          <Button variant="secondary" size="sm" onClick={() => reset()}>
            <FaArrowRotateRight className="h-3.5 w-3.5" />
            Try again
          </Button>
          <Link href="/dashboard" className={buttonClasses({ variant: "secondary", size: "sm", hover: "hover" })}>
            <FaHouse className="h-3.5 w-3.5" />
            Go to Dashboard
          </Link>
        </>
      }
      footer={error.digest && <div className="mt-4 font-mono text-[0.72rem] text-text-muted/70">Ref: {error.digest}</div>}
    >
      Nothing was lost — you can try loading it again.
    </FullScreenMessage>
  );
}
