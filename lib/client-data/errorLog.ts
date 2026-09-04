import { createClient } from "@/lib/supabase/client";

const BREADCRUMB_KEY = "vici_error_breadcrumbs";
const MAX_BREADCRUMBS = 12;

interface Breadcrumb {
  at: string;
  path: string;
}

// sessionStorage, not a module-level array -- global-error.tsx replaces the *entire* tree
// (html/body included) when the root layout itself throws, so any in-memory trail would be
// gone by the time it's needed. sessionStorage survives that and a plain reload alike.
function readBreadcrumbs(): Breadcrumb[] {
  try {
    const raw = sessionStorage.getItem(BREADCRUMB_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeBreadcrumbs(trail: Breadcrumb[]) {
  try {
    sessionStorage.setItem(BREADCRUMB_KEY, JSON.stringify(trail.slice(-MAX_BREADCRUMBS)));
  } catch {
    // sessionStorage unavailable (private mode, quota) -- breadcrumbs are best-effort only
  }
}

/** Call on every route change so a later error can show what pages led up to it. */
export function recordPageVisit(path: string) {
  const trail = readBreadcrumbs();
  if (trail[trail.length - 1]?.path === path) return; // dedupe re-renders on the same path
  trail.push({ at: new Date().toISOString(), path });
  writeBreadcrumbs(trail);
}

export type ErrorSource =
  | "react_error_boundary"
  | "global_error_boundary"
  | "window_error"
  | "unhandled_rejection"
  | "manual";

interface LogClientErrorParams {
  source: ErrorSource;
  error: unknown;
  digest?: string;
  context?: Record<string, unknown>;
}

/**
 * Best-effort archive of a client-side error to public.error_logs -- never throws, since a
 * failure here shouldn't compound whatever already went wrong. Silently no-ops when signed
 * out: error_logs' RLS policy only accepts authenticated inserts, matching the rest of the
 * app's authenticated-only data access.
 */
export async function logClientError({ source, error, digest, context }: LogClientErrorParams): Promise<void> {
  try {
    const supabase = createClient();
    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) return;

    const trail = readBreadcrumbs();
    const previousPath = trail.length > 1 ? trail[trail.length - 2].path : null;

    await supabase.from("error_logs").insert({
      user_id: userId,
      source,
      error_name: error instanceof Error ? error.name : null,
      message: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? (error.stack ?? null) : null,
      digest: digest ?? null,
      page_path: typeof window !== "undefined" ? window.location.pathname + window.location.search : null,
      previous_page_path: previousPath,
      breadcrumbs: trail,
      context: context ?? null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent : null,
    });
  } catch {
    // best-effort: never let error logging itself throw
  }
}
