"use client";

import { useCallback, useRef, useState } from "react";
import { useOnPageRestored } from "@/lib/useOnPageRestored";
import type { AuthFailure } from "@/lib/auth/passwordAuth";

type Outcome = { ok: true } | { ok: false; failure: AuthFailure };

/**
 * The submit state every auth form repeats: `submitting`, the `failure` shown under the form, and the
 * "ignore a second click, clear the old message, run, show what went wrong" dance around the call.
 *
 * `submit(action)` runs `action` and resolves with its successful result, or `null` when it failed
 * (the failure is already on screen and the form usable again) or was ignored because a submit was
 * already running. On success `submitting` stays true on purpose: every form either navigates away
 * (a full page load, so the button must not flash back to enabled) or swaps itself out; one that
 * stays on screen calls `stop()` itself.
 *
 * `onFailure` can claim a failure before it is shown (return true): the caller is then navigating
 * somewhere else with it, e.g. login sending an unconfirmed account to the code page.
 *
 * A form restored from the back/forward cache comes back still submitting, so that resets here too.
 */
export function useAuthSubmit() {
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  // A ref as well as state: two clicks in the same tick both see `submitting === false` otherwise.
  const running = useRef(false);

  const stop = useCallback(() => {
    running.current = false;
    setSubmitting(false);
  }, []);

  useOnPageRestored(stop);

  const submit = useCallback(
    async <R extends Outcome>(
      action: () => Promise<R>,
      options?: { onFailure?: (failure: AuthFailure) => boolean }
    ): Promise<Extract<R, { ok: true }> | null> => {
      if (running.current) return null;
      running.current = true;
      setFailure(null);
      setSubmitting(true);
      const result = await action();
      if (!result.ok) {
        if (options?.onFailure?.(result.failure)) return null;
        setFailure(result.failure);
        stop();
        return null;
      }
      return result as Extract<R, { ok: true }>;
    },
    [stop]
  );

  return { submitting, failure, setFailure, submit, stop };
}
