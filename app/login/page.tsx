"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FcGoogle } from "react-icons/fc";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useToast } from "@/app/components/ui/Toast";
import { Badge } from "@/app/components/ui/Badge";
import { Button } from "@/app/components/ui/Button";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { Logo } from "@/app/components/ui/Logo";
import {
  getActiveRegion,
  hasStoredActiveRegion,
  isMultiRegionEnabled,
  isRegion,
  setActiveRegion,
  type Region,
} from "@/lib/supabase/regions";

function LoginErrorNotice({ onWrongRegion }: { onWrongRegion: (region: Region) => void }) {
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  useEffect(() => {
    const error = searchParams.get("error");
    if (!error) return;
    if (error === "wrong_region") {
      // Set by app/auth/callback/page.tsx when the multi-region "Before User Created" hook
      // rejects a signup whose email already belongs to the other region.
      const regionParam = searchParams.get("region");
      if (isRegion(regionParam)) onWrongRegion(regionParam);
      showToast(
        regionParam
          ? `Your account is registered in the ${regionParam.toUpperCase()} region. Retrying from there.`
          : "Your account is registered in a different region. Please try again from there.",
        "error"
      );
      return;
    }
    showToast("Couldn't sign you in. Only @gmail.com Google accounts are supported.", "error");
  }, [searchParams, showToast, onWrongRegion]);

  return null;
}

const REGION_LABEL: Record<Region, string> = { eu: "Europe", us: "Americas" };

/** Shown only behind NEXT_PUBLIC_MULTI_REGION -- picks which Supabase project createClient()
 * talks to (lib/supabase/regions.ts), before the user ever clicks "Continue with Google". Picking
 * a different region than the page loaded with forces a reload: AuthProvider (mounted once at the
 * root layout) already built its own client for the region active at mount time and subscribed to
 * *that* GoTrue instance's auth events -- changing the active region afterward without reloading
 * would leave it listening to the wrong project indefinitely. A manual region change is rare
 * enough that a reload is a fine trade for not having to keep two client instances in sync. */
function RegionPicker({ region }: { region: Region }) {
  return (
    <div className="mx-auto mb-[clamp(1.5rem,3dvh,2.5rem)] flex w-fit gap-1 rounded-full border border-border-soft bg-white/[0.03] p-1">
      {(["eu", "us"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => {
            if (option === region) return;
            setActiveRegion(option);
            window.location.reload();
          }}
          className={`rounded-full px-4 py-1.5 text-xs font-bold uppercase tracking-[0.5px] transition-colors ${
            option === region ? "bg-accent-red text-white" : "text-text-muted hover:text-white"
          }`}
        >
          {REGION_LABEL[option]}
        </button>
      ))}
    </div>
  );
}

export default function LoginPage() {
  const [loading, setLoading] = useState(false);
  const [region, setRegion] = useState<Region | null>(null);
  const { showToast } = useToast();
  const { status } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "authed") router.replace("/dashboard");
  }, [status, router]);

  useEffect(() => {
    // Restoring from bfcache after the user hits Back on Google's account
    // chooser leaves `loading` stuck true — the page never remounts.
    function handlePageShow(event: PageTransitionEvent) {
      if (event.persisted) setLoading(false);
    }
    window.addEventListener("pageshow", handlePageShow);
    return () => window.removeEventListener("pageshow", handlePageShow);
  }, []);

  useEffect(() => {
    if (!isMultiRegionEnabled()) return;
    // getActiveRegion() always resolves synchronously (persisted, or a timezone-based guess) --
    // show that immediately so the picker never flashes empty. Only a first-time visitor (nothing
    // persisted yet) gets upgraded to the Worker's real geo-IP guess, once it's back.
    const initial = getActiveRegion();
    setRegion(initial);
    if (hasStoredActiveRegion()) return;

    let cancelled = false;
    fetch("/api/geo")
      .then((res) => res.json())
      .then((body: { region?: unknown }) => {
        if (cancelled || !isRegion(body.region) || body.region === initial) return;
        setActiveRegion(body.region);
        setRegion(body.region);
      })
      .catch(() => {
        // Offline / Worker unreachable -- keep the timezone-based guess already shown.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleGoogleLogin() {
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
        queryParams: {
          access_type: "offline",
          prompt: "select_account",
          // Best-effort hint to Google's account chooser — not a real guarantee,
          // the @gmail.com requirement is enforced in the database.
          hd: "gmail.com",
        },
      },
    });

    if (error) {
      setLoading(false);
      showToast("Sign-in failed. Please try again.", "error");
    }
    // On success the browser navigates away to Google — no further state change needed.
  }

  if (status !== "anon") return <FullScreenLoader />;

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-y-auto px-6 py-6 text-center before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_50%_20%,rgb(255_74_90/0.1)_0%,transparent_55%)]">
      <Suspense fallback={null}>
        <LoginErrorNotice
          onWrongRegion={(correctRegion) => {
            setActiveRegion(correctRegion);
            setRegion(correctRegion);
          }}
        />
      </Suspense>
      <div className="relative w-full max-w-[460px]">
        <Logo size={112} className="mx-auto mb-[clamp(1.75rem,4dvh,4rem)]" />
        <Badge className="mb-[clamp(0.75rem,2.5dvh,2.5rem)]">Spaced repetition</Badge>
        <h1 className="mb-[clamp(0.5rem,1.5dvh,1.75rem)] text-[2.6rem] font-extrabold leading-tight tracking-[-0.8px]">
          Learn Japanese
          <br />
          at your own pace.
        </h1>
        <p className="mb-[clamp(2.5rem,6dvh,5.5rem)] text-base leading-[1.6] text-text-muted">
          Kanji, readings, and vocabulary organized by JLPT level, scheduled for exactly when your brain needs to
          see them again.
        </p>
        {region && <RegionPicker region={region} />}

        <Button
          type="button"
          className="w-full max-w-[360px]"
          loading={loading}
          loadingIconPosition="right"
          onClick={handleGoogleLogin}
        >
          <FcGoogle className="h-5 w-5 shrink-0 rounded-full bg-white p-0.5" />
          Continue with Google
        </Button>
      </div>
    </div>
  );
}
