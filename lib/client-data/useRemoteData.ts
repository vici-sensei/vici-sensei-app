"use client";

import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";
import { getErrorMessage } from "@/lib/api/client";
import type { AsyncStatus } from "@/lib/types";

interface RemoteState<T> {
  status: AsyncStatus;
  data: T | null;
  error: string | null;
  /** The request this state came from, so a changed request can tell stale state from fresh. */
  key: string | null;
}

interface RemoteDataOptions<T, P> {
  /** What to load. Anything JSON-serializable (an id, a user id, an object of both): when it
   * changes, the data is loaded again. null means "not ready yet" (no user, no id) -- nothing is
   * loaded and the status stays "loading". */
  params: P | null;
  load: (params: P) => Promise<T>;
  /** Shown as `error` when `load` throws something with no message of its own. */
  errorFallback: string;
}

/** Loads one thing from the backend and keeps it: `{ data, status, error }` plus `refetch` and
 * `mutate` (an optimistic local edit, e.g. a card just suspended, until the next refetch settles it).
 *
 * `status` is "loading" only until the first answer: a refetch -- or `params` changing to something
 * new -- keeps showing the data it already has instead of blanking the page, and the next answer
 * simply replaces it. A failure always ends in "error"; the next refetch (or a different request)
 * goes through "loading" again. Only the newest request is applied, so a slow answer to an older
 * one can never overwrite a newer one. */
export function useRemoteData<T, P>({ params, load, errorFallback }: RemoteDataOptions<T, P>) {
  const key = params === null ? null : JSON.stringify(params);
  const [state, setState] = useState<RemoteState<T>>({ status: "loading", data: null, error: null, key: null });

  // Always the latest render's values, so `run` below can stay one stable function whatever the
  // caller's `load` closure captured. Updated in an effect, which runs before the loading effect.
  const latest = useRef({ params, load, errorFallback });
  useEffect(() => {
    latest.current = { params, load, errorFallback };
  });
  const newestRequest = useRef(0);

  const run = useCallback(async () => {
    const { params: current, load: loadNow, errorFallback: fallback } = latest.current;
    if (current === null) return;
    const requestKey = JSON.stringify(current);
    const request = ++newestRequest.current;
    try {
      const data = await loadNow(current);
      if (request === newestRequest.current) setState({ status: "loaded", data, error: null, key: requestKey });
    } catch (err) {
      if (request === newestRequest.current) {
        setState((prev) => ({ status: "error", data: prev.data, error: getErrorMessage(err, fallback), key: requestKey }));
      }
    }
  }, []);

  useEffect(() => {
    if (key !== null) void run();
  }, [key, run]);

  const refetch = useCallback(() => {
    // Retrying after a failure goes back through "loading"; anything else keeps what is on screen.
    setState((prev) => (prev.status === "error" ? { ...prev, status: "loading" } : prev));
    return run();
  }, [run]);

  const mutate = useCallback((next: SetStateAction<T | null>) => {
    setState((prev) => ({
      ...prev,
      data: typeof next === "function" ? (next as (previous: T | null) => T | null)(prev.data) : next,
    }));
  }, []);

  // An error belongs to the request that failed: once `params` points somewhere else, it is loading again.
  const status = state.status === "error" && state.key !== key ? "loading" : state.status;
  return { data: state.data, status, error: state.error, refetch, mutate };
}
