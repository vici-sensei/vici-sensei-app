"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { recordPageVisit, logClientError } from "@/lib/client-data/errorLog";

/** Records the breadcrumb trail used by error_logs, and catches whatever errors React's own
 * boundaries (app/error.tsx, app/global-error.tsx) never see: exceptions thrown outside
 * rendering (event handlers, timers) and unhandled promise rejections.
 *
 * Pathname only, no useSearchParams -- that hook forces static pages (the marketing page,
 * /login) into a Suspense boundary to avoid a production build failure, which this component
 * mounted app-wide would impose on every route for a query string breadcrumbs don't need. */
export function ErrorLogging() {
  const pathname = usePathname();

  useEffect(() => {
    recordPageVisit(pathname);
  }, [pathname]);

  useEffect(() => {
    const onWindowError = (event: ErrorEvent) => {
      void logClientError({ source: "window_error", error: event.error ?? event.message });
    };
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      void logClientError({ source: "unhandled_rejection", error: event.reason });
    };

    window.addEventListener("error", onWindowError);
    window.addEventListener("unhandledrejection", onUnhandledRejection);
    return () => {
      window.removeEventListener("error", onWindowError);
      window.removeEventListener("unhandledrejection", onUnhandledRejection);
    };
  }, []);

  return null;
}
