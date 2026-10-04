"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

// Cloudflare Turnstile, explicit rendering (https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/).
// Supabase verifies the token itself when its "Captcha protection" is on -- the app only has to
// hand one to every signUp / signIn / resetPassword call. No site key configured = no captcha at
// all (local development with the Dashboard toggle off), `getToken()` just resolves `undefined`.

interface TurnstileApi {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  execute: (widgetId: string) => void;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  scriptPromise ??= new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_SRC;
    script.async = true;
    script.onload = () => resolve();
    script.onerror = () => {
      scriptPromise = null;
      reject(new Error("turnstile script failed to load"));
    };
    document.head.appendChild(script);
  });
  return scriptPromise;
}

export interface TurnstileHandle {
  /** A fresh single-use token, or `undefined` when captcha isn't configured. Rejects if the
   * challenge fails or the script can't load -- callers treat that as a failed captcha. */
  getToken: () => Promise<string | undefined>;
}

interface Pending {
  resolve: (token: string) => void;
  reject: (reason: Error) => void;
}

/**
 * Invisible widget (`appearance: "interaction-only"`: it only shows UI if Cloudflare decides the
 * visitor needs to interact). Mount one per form and call `ref.current.getToken()` right before each
 * request -- a token is single-use, so the second region attempt of a sign-in or a password reset
 * gets its own.
 */
export const Turnstile = forwardRef<TurnstileHandle>(function Turnstile(_props, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const readyRef = useRef<Promise<string> | null>(null);

  useEffect(() => {
    if (!SITE_KEY) return;
    let removed = false;
    readyRef.current = loadScript().then(() => {
      if (removed || !containerRef.current || !window.turnstile) throw new Error("turnstile unavailable");
      const id = window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        execution: "execute",
        appearance: "interaction-only",
        callback: (token: string) => pendingRef.current?.resolve(token),
        "error-callback": () => pendingRef.current?.reject(new Error("turnstile error")),
        "timeout-callback": () => pendingRef.current?.reject(new Error("turnstile timeout")),
        "expired-callback": () => undefined,
      });
      widgetIdRef.current = id;
      return id;
    });
    // A rejected `ready` promise is handled where getToken awaits it; this keeps an unused one
    // (user never submits) from being reported as an unhandled rejection.
    readyRef.current.catch(() => undefined);
    return () => {
      removed = true;
      if (widgetIdRef.current) window.turnstile?.remove(widgetIdRef.current);
      widgetIdRef.current = null;
    };
  }, []);

  useImperativeHandle(ref, () => ({
    async getToken() {
      if (!SITE_KEY) return undefined;
      const widgetId = await readyRef.current;
      if (!widgetId || !window.turnstile) throw new Error("turnstile unavailable");
      const turnstile = window.turnstile;
      return new Promise<string>((resolve, reject) => {
        pendingRef.current = { resolve, reject };
        turnstile.reset(widgetId);
        turnstile.execute(widgetId);
      });
    },
  }));

  return <div ref={containerRef} className="flex justify-center empty:hidden" />;
});
