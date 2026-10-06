"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ComponentProps } from "react";
import { Button } from "@/app/components/ui/Button";
import { FormMessage } from "@/app/components/auth/AuthLayout";

// Cloudflare Turnstile, explicit rendering (https://developers.cloudflare.com/turnstile/get-started/client-side-rendering/).
// Supabase verifies the token itself when its "Captcha protection" is on -- the app only has to
// hand one to every signUp / signIn / resetPassword call. No site key configured = no captcha at
// all (local development with the Dashboard toggle off), `getToken()` just resolves `undefined`.
//
// How it looks to the person: nothing at all in the usual case. The check runs in the background as
// soon as the form appears, so a token is normally ready before the submit button is pressed. Only
// when Cloudflare decides it needs the person (`interaction-only`) does a small card with the
// checkbox show up, and the submit button (CaptchaButton) turns into "Complete the check above"
// instead of spinning -- a spinner means *we* are working, and here we are waiting on them.

interface TurnstileApi {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  execute: (widgetId: string) => void;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
  isExpired: (widgetId: string) => boolean;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT_SRC = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
// How long a submit waits for an invisible check before giving up (a visible challenge has Cloudflare's own timeout).
const INVISIBLE_WAIT_MS = 30_000;

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

interface Engine {
  getToken: () => Promise<string | undefined>;
}

interface Pending {
  resolve: (token: string) => void;
  reject: (reason: Error) => void;
}

export interface TurnstileController {
  /** A fresh single-use token, or `undefined` when captcha isn't configured. Rejects if the
   * challenge fails or the script can't load -- callers treat that as a failed captcha. */
  getToken: () => Promise<string | undefined>;
  /** True while a visible challenge is waiting on the person and its card is on screen. */
  waiting: boolean;
  /** Wiring between this hook and <Turnstile>; callers don't touch it. */
  link: { attach: (engine: Engine | null) => void; setChallenging: (value: boolean) => void };
}

/** One per form. Pass the result to <Turnstile> and <CaptchaButton>, and call `getToken()` right
 * before each request -- a token is single-use, so the second region attempt of a sign-in or a
 * password reset gets its own.
 *
 * `revealed` is whether the person has got far enough in the form for the check to be worth
 * showing: until then a challenge Cloudflare already asked for stays out of sight (it is waiting,
 * not lost), and the card slides in the moment the form is complete. */
export function useTurnstile(revealed = true): TurnstileController {
  const engine = useRef<Engine | null>(null);
  const [challenging, setChallenging] = useState(false);
  const attach = useCallback((next: Engine | null) => {
    engine.current = next;
  }, []);
  return {
    getToken: async () => engine.current?.getToken(),
    waiting: challenging && revealed,
    link: { attach, setChallenging },
  };
}

const CARD = "rounded-xl border border-border-soft bg-white/[0.03] p-3 text-left";

// The widget is a cross-origin iframe: its colours can't be set, only `theme` chosen. So it is
// dressed from outside, without hiding anything of Cloudflare's (logo and links stay; removing
// them is the Enterprise "offlabel" feature). Its dark theme paints a flat ~rgb(48,50,48) box with
// a 1px light-grey border. The border is cropped off (overflow hidden, the iframe pushed outward
// by 2px) and the box is darkened toward the card (~rgb(19,23,33)) with a CSS filter. That filter
// is `brightness(b) contrast(c)`, i.e. x -> (b*x - .5)*c + .5, with b and c solved so that white
// stays white (the text keeps its full contrast, which a plain `brightness()` would not) and
// 48/255 lands on 22/255. It stays neutral grey; an SVG `url()` filter could tint it to the card's
// blue but is not applied to cross-origin iframes by Chromium, and a blend-mode overlay can hide
// the widget while it composites -- not worth risking the one control that gates sign-up. Re-check
// the numbers if Cloudflare ever changes the widget's dark palette.
const WIDGET_FILTER = "brightness(0.899) contrast(1.252)";

/**
 * Mount one per form, above the submit button. `lazy` skips the background check and only runs it
 * when `getToken()` is called -- for a form where the captcha guards a secondary action (the
 * resend link on the code screen), so a challenge doesn't greet someone who only came to type a code.
 */
export function Turnstile({ captcha, lazy = false }: { captcha: TurnstileController; lazy?: boolean }) {
  const { attach, setChallenging } = captcha.link;
  const { waiting } = captcha;
  const wrapperRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // The widget (or its script) is broken -- blocked, offline, misconfigured. Shown with a retry.
  const [failed, setFailed] = useState(false);
  // A visible challenge was just solved and its token is waiting for the submit.
  const [verified, setVerified] = useState(false);
  // Bumped by "Try again" to tear the widget down and build it from scratch.
  const [attempt, setAttempt] = useState(0);

  useLayoutEffect(() => {
    // The collapsed card is a zero-height flex item, which still gets a gap on each side. Pulling it
    // up by one gap keeps the form's spacing identical to "no card"; the form's own gap is read
    // rather than passed in so every form can keep the spacing it already has.
    const wrapper = wrapperRef.current;
    const parent = wrapper?.parentElement;
    if (!wrapper || !parent) return;
    const gap = parseFloat(getComputedStyle(parent).rowGap);
    wrapper.style.setProperty("--captcha-gap", Number.isFinite(gap) ? `${gap}px` : "0px");
  }, []);

  useEffect(() => {
    if (!SITE_KEY) return;
    let removed = false;
    let widgetId: string | null = null;
    let token: string | null = null; // verified and unused
    let pending: Pending | null = null; // a submit waiting for one
    let waitTimer: ReturnType<typeof setTimeout> | undefined;
    let inChallenge = false;
    let sawChallenge = false; // the token being produced needed the person
    let broken = false;

    const clearWait = () => {
      clearTimeout(waitTimer);
      waitTimer = undefined;
    };
    const rejectPending = (reason: string) => {
      clearWait();
      if (!pending) return;
      const waiting = pending;
      pending = null;
      waiting.reject(new Error(reason));
    };
    const onToken = (value: string) => {
      inChallenge = false;
      broken = false;
      setChallenging(false);
      setFailed(false);
      clearWait();
      if (pending) {
        const waiting = pending;
        pending = null;
        sawChallenge = false;
        waiting.resolve(value);
        // The next token, in the background, for the next request.
        if (!lazy && widgetId) window.turnstile?.reset(widgetId);
        return;
      }
      token = value;
      if (sawChallenge) setVerified(true);
    };
    const onBroken = () => {
      inChallenge = false;
      broken = true;
      setChallenging(false);
      setFailed(true);
      rejectPending("turnstile error");
    };

    const ready = loadScript().then(() => {
      const turnstile = window.turnstile;
      if (removed || !containerRef.current || !turnstile) throw new Error("turnstile unavailable");
      widgetId = turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        theme: "dark",
        size: "flexible",
        appearance: "interaction-only",
        ...(lazy ? { execution: "execute" } : {}),
        callback: onToken,
        "error-callback": onBroken,
        "unsupported-callback": onBroken,
        "before-interactive-callback": () => {
          inChallenge = true;
          sawChallenge = true;
          clearWait();
          setVerified(false);
          setChallenging(true);
        },
        "after-interactive-callback": () => {
          inChallenge = false;
          setChallenging(false);
        },
        // The person walked away from a visible challenge; Cloudflare re-arms it by itself.
        "timeout-callback": () => rejectPending("turnstile timeout"),
        // Unused tokens expire after 5 minutes; Cloudflare then re-runs the check by itself.
        "expired-callback": () => {
          token = null;
          sawChallenge = false;
          setVerified(false);
        },
      });
      return widgetId;
    });
    // A rejected `ready` is handled where getToken awaits it; this covers the case where nobody
    // does (the person never submits) and tells them the check can't run.
    ready.catch(() => {
      if (removed) return;
      broken = true;
      setFailed(true);
    });

    attach({
      async getToken() {
        const id = await ready;
        const turnstile = window.turnstile;
        if (!turnstile) throw new Error("turnstile unavailable");
        if (token && !turnstile.isExpired(id)) {
          const held = token;
          token = null;
          sawChallenge = false;
          setVerified(false);
          turnstile.reset(id);
          return held;
        }
        return new Promise<string>((resolve, reject) => {
          pending = { resolve, reject };
          if (lazy) {
            turnstile.reset(id);
            turnstile.execute(id);
          } else if (broken) {
            turnstile.reset(id);
          }
          clearWait();
          if (!inChallenge) waitTimer = setTimeout(() => rejectPending("turnstile timeout"), INVISIBLE_WAIT_MS);
        });
      },
    });

    return () => {
      removed = true;
      rejectPending("turnstile removed");
      attach(null);
      if (widgetId) window.turnstile?.remove(widgetId);
      setChallenging(false);
    };
  }, [attach, setChallenging, lazy, attempt]);

  if (!SITE_KEY) return null;

  return (
    <>
      {/* Always mounted (the check runs inside it) but collapsed to nothing until the card is wanted;
          it grows open (rows 0fr -> 1fr) rather than popping in. `inert` keeps the collapsed widget
          out of the tab order and away from screen readers. */}
      <div
        ref={wrapperRef}
        inert={!waiting}
        style={waiting ? undefined : { marginTop: "calc(var(--captcha-gap, 0px) * -1)" }}
        className={`grid transition-[grid-template-rows,margin-top,opacity] duration-300 ease-out motion-reduce:transition-none ${
          waiting ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
      >
        <div className="min-h-0 overflow-hidden">
          <div className={CARD}>
            <div className="mb-2.5">
              <p className="text-[0.9rem] font-bold text-white">One quick check</p>
              <p className="mt-0.5 text-[0.8rem] leading-normal text-text-muted">Helps keep bots out.</p>
            </div>
            {/* The widget is at least 300px wide; on a ~360px phone the card's padding would squeeze it out.
                The outline is ours, same as the text inputs'; `-m-0.5` pushes Cloudflare's own border out
                of view, and `leading-[0]` removes the inline-iframe gap Cloudflare's markup leaves under it. */}
            <div className="-mx-2 overflow-hidden rounded-lg border border-border-soft min-[380px]:mx-0">
              <div className="flow-root" style={{ filter: WIDGET_FILTER }}>
                <div ref={containerRef} className="-m-0.5 leading-[0]" />
              </div>
            </div>
          </div>
        </div>
      </div>
      {verified && !waiting && (
        <p aria-hidden="true" className="text-[0.85rem] font-semibold text-accent-green">
          ✓ Verified
        </p>
      )}
      {failed && (
        <FormMessage tone="error">
          The security check isn&apos;t loading. Check your connection or turn off content blockers for this site.{" "}
          <button
            type="button"
            onClick={() => {
              setFailed(false);
              setAttempt((n) => n + 1);
            }}
            className="cursor-pointer font-bold underline"
          >
            Try again
          </button>
        </FormMessage>
      )}
      <p role="status" className="sr-only">
        {waiting ? "Please complete the security check to continue." : verified ? "Verified." : ""}
      </p>
    </>
  );
}

/** The submit button of a form that sends a captcha token: while a visible challenge waits on the
 * person it is disabled and says what to do, with no spinner (nothing is loading). */
export function CaptchaButton({
  captcha,
  loading = false,
  disabled,
  children,
  ...rest
}: ComponentProps<typeof Button> & { captcha: TurnstileController }) {
  const { waiting } = captcha;
  return (
    <Button {...rest} loading={loading && !waiting} disabled={disabled || waiting}>
      {waiting ? "Complete the check above" : children}
    </Button>
  );
}
