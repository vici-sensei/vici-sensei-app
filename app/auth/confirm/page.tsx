"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/app/components/ui/Button";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { fieldHint, fieldLabel, textInput } from "@/app/components/ui/formClasses";
import { AuthLayout, FormMessage } from "@/app/components/auth/AuthLayout";
import { AuthForm } from "@/app/components/auth/AuthForm";
import { EmailField } from "@/app/components/auth/AuthFields";
import { useTurnstile } from "@/app/components/auth/Turnstile";
import { finalizeEmailChange } from "@/lib/client-data/account";
import { finishSignIn } from "@/lib/auth/finishSignIn";
import {
  clearPendingAuth,
  isPasswordAuthEnabled,
  looksLikeEmail,
  readPendingAuth,
  resendSignUpCode,
  verifyAuthToken,
  type VerifyType,
} from "@/lib/auth/passwordAuth";
import { useAuthSubmit } from "@/lib/auth/useAuthSubmit";
import { isRegion } from "@/lib/supabase/regions";

const RESEND_COOLDOWN_SECONDS = 60;

function verifyTypeFrom(param: string | null): VerifyType {
  if (param === "recovery") return "recovery";
  if (param === "email_change") return "email_change";
  // "email" is what the Dashboard templates send; "signup"/"magiclink" are older spellings of the
  // same verification and are accepted so a stale link still works.
  return "email";
}

const COPY: Record<VerifyType, { title: string; linkSubtitle: string; button: string }> = {
  email: {
    title: "Confirm your email",
    linkSubtitle: "One more step to finish creating your account.",
    button: "Confirm my email",
  },
  recovery: {
    title: "Reset your password",
    linkSubtitle: "Continue to choose a new password.",
    button: "Continue",
  },
  email_change: {
    title: "Confirm your new email",
    linkSubtitle: "Confirm to switch your account to the new address.",
    button: "Confirm new email",
  },
};

function ConfirmInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tokenHash = searchParams.get("token_hash");
  const type = verifyTypeFrom(searchParams.get("type"));
  const regionParam = searchParams.get("region");
  const captcha = useTurnstile();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const { submitting, failure, setFailure, submit } = useAuthSubmit();
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const enabled = isPasswordAuthEnabled();

  useEffect(() => {
    if (!enabled) router.replace("/login");
  }, [enabled, router]);

  useEffect(() => {
    // sessionStorage only exists in the browser, so this can't be the initial state (it would
    // mismatch the statically exported HTML).
    function sync() {
      const pending = readPendingAuth();
      if (pending && pending.kind === type) setEmail(pending.email);
    }
    sync();
  }, [type]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  if (!enabled) return <FullScreenLoader />;

  /** What happens once a token/code is accepted. Always a full page load: AuthProvider is bound to
   * the region that was active when it mounted, and the token may have been issued by the other one. */
  async function onVerified() {
    clearPendingAuth();
    if (type === "recovery") {
      window.location.assign("/reset-password");
      return;
    }
    if (type === "email_change") {
      // Frees the old address in the region ledger (best-effort, the weekly sweep backs it up).
      await finalizeEmailChange();
      window.location.assign("/settings/profile?emailChanged=1");
      return;
    }
    const finished = await finishSignIn();
    if (finished.kind === "moved") {
      window.location.assign(`/login?error=account_moved&region=${finished.region}`);
      return;
    }
    window.location.assign("/dashboard");
  }

  async function handleVerifyLink() {
    if (!tokenHash) return;
    const result = await submit(() =>
      verifyAuthToken({ type, tokenHash, region: isRegion(regionParam) ? regionParam : undefined })
    );
    if (!result) return;
    await onVerified();
  }

  async function handleVerifyCode(event: FormEvent) {
    event.preventDefault();
    if (!looksLikeEmail(email)) {
      setFailure({ code: "invalid_email", message: "Enter the email the code was sent to." });
      return;
    }
    if (code.trim().length < 6) {
      setFailure({ code: "invalid_code", message: "Enter the code from the email." });
      return;
    }
    const result = await submit(() => verifyAuthToken({ type, email, code }));
    if (!result) return;
    await onVerified();
  }

  async function handleResend() {
    if (cooldown > 0 || submitting) return;
    if (!looksLikeEmail(email)) {
      setFailure({ code: "invalid_email", message: "Enter your email first." });
      return;
    }
    setFailure(null);
    setNotice(null);
    setCooldown(RESEND_COOLDOWN_SECONDS);
    const result = await resendSignUpCode(email, captcha.getToken);
    if (!result.ok) {
      setCooldown(0);
      setFailure(result.failure);
      return;
    }
    setNotice("If that email can still be confirmed, a new code is on its way.");
  }

  const copy = COPY[type];

  if (tokenHash) {
    // Deliberately a button, not an automatic verify on load: some mail providers prefetch links
    // for spam scanning, which would burn the one-time token before the person ever clicks.
    return (
      <AuthLayout title={copy.title} subtitle={copy.linkSubtitle}>
        <div className="flex flex-col gap-4">
          {failure && <FormMessage tone="error">{failure.message}</FormMessage>}
          <Button type="button" className="w-full" loading={submitting} onClick={handleVerifyLink}>
            {copy.button}
          </Button>
          {failure && (
            <p className="text-center text-[0.9rem] text-text-muted">
              <Link
                href={type === "recovery" ? "/forgot-password" : "/login"}
                className="font-bold text-accent-blue hover:underline"
              >
                {type === "recovery" ? "Request a new reset link" : "Back to log in"}
              </Link>
            </p>
          )}
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={type === "recovery" ? "Check your email" : "Enter your code"}
      subtitle={
        type === "recovery"
          ? "If an account exists for that email, we sent a code and a reset link. Enter the code below, or open the link."
          : "We sent a code to your email. Enter it below, or open the link in the same email."
      }
    >
      <AuthForm
        onSubmit={handleVerifyCode}
        className="gap-4"
        submitting={submitting}
        failure={failure}
        notice={notice && <FormMessage tone="info">{notice}</FormMessage>}
        // The check only guards "Send a new code", so it shouldn't greet someone who came to type a code.
        captcha={captcha}
        captchaGuardsSubmit={false}
        submitLabel={type === "recovery" ? "Continue" : "Confirm email"}
      >
        <EmailField id="confirm-email" value={email} onChange={setEmail} validate={false} />
        <div>
          <label htmlFor="confirm-code" className={fieldLabel}>
            Code
          </label>
          <input
            id="confirm-code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={8}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
            className={`${textInput} text-center text-[1.3rem] font-bold tracking-[0.4em]`}
          />
          <p className={fieldHint}>It can take a minute to arrive. Check your spam folder too.</p>
        </div>
      </AuthForm>
      <div className="mt-6 flex flex-col items-center gap-2 text-[0.9rem] text-text-muted">
        {type === "recovery" ? (
          <Link href="/forgot-password" className="font-bold text-accent-blue hover:underline">
            Send a new code
          </Link>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            disabled={cooldown > 0 || submitting}
            className="font-bold text-accent-blue hover:underline disabled:cursor-not-allowed disabled:text-text-muted disabled:no-underline"
          >
            {cooldown > 0 ? `Send a new code (${cooldown}s)` : "Send a new code"}
          </button>
        )}
        <Link href="/login" className="hover:text-white">
          Back to log in
        </Link>
      </div>
    </AuthLayout>
  );
}

export default function AuthConfirmPage() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <ConfirmInner />
    </Suspense>
  );
}
