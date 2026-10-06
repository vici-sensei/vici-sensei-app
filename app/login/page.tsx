"use client";

import { Suspense, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useToast } from "@/app/components/ui/Toast";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { Logo } from "@/app/components/ui/Logo";
import { fieldLabel, textInput } from "@/app/components/ui/formClasses";
import {
  AUTH_LOGO_SIZE,
  FieldError,
  FormMessage,
  OrDivider,
  PasswordMessage,
} from "@/app/components/auth/AuthLayout";
import { GoogleButton } from "@/app/components/auth/GoogleButton";
import { PasswordField } from "@/app/components/auth/PasswordField";
import { RegionPicker } from "@/app/components/auth/RegionPicker";
import { CaptchaButton, Turnstile, useTurnstile } from "@/app/components/auth/Turnstile";
import { finishSignIn } from "@/lib/auth/finishSignIn";
import {
  emailFieldError,
  isPasswordAuthEnabled,
  looksLikeEmail,
  passwordFieldError,
  rememberPendingAuth,
  signInWithPasswordAcrossRegions,
  type AuthFailure,
} from "@/lib/auth/passwordAuth";
import { useAuthRegion } from "@/lib/auth/useAuthRegion";
import { useRememberedEmail } from "@/lib/auth/useRememberedEmail";
import { isRegion, setActiveRegion, type Region } from "@/lib/supabase/regions";

function LoginErrorNotice({ onWrongRegion }: { onWrongRegion: (region: Region) => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { showToast } = useToast();

  useEffect(() => {
    const error = searchParams.get("error");
    if (!error) return;
    // Consume the ?error param immediately: onWrongRegion/showToast are new references on
    // every LoginPage re-render (e.g. the geo-IP effect resolving), which would otherwise
    // re-run this effect and re-show the toast indefinitely as long as the param lingers.
    router.replace("/login", { scroll: false });
    if (error === "wrong_region") {
      // Set by app/auth/callback/page.tsx when the multi-region "Before User Created" hook
      // rejects a signup whose email already belongs to the other region (also by /signup).
      const regionParam = searchParams.get("region");
      if (isRegion(regionParam)) onWrongRegion(regionParam);
      showToast(
        regionParam
          ? `Your account is registered in the ${regionParam.toUpperCase()} region. Retrying from there.`
          : "Your account is registered in a different region. Please try again from there.",
        "info"
      );
      return;
    }
    if (error === "account_moved") {
      // Set by app/auth/callback/page.tsx when check_account_moved() finds this account was
      // self-service moved to the other region (Settings -> Server region) -- logging into the
      // OLD region again (stale bookmark, another device) must not look like a normal failure,
      // and must point the picker at the region their data actually lives in now.
      const regionParam = searchParams.get("region");
      if (isRegion(regionParam)) onWrongRegion(regionParam);
      showToast(
        regionParam
          ? `Your account has moved to the ${regionParam.toUpperCase()} region. Please sign in from there.`
          : "Your account has moved to a different region. Please sign in from there.",
        "info"
      );
      return;
    }
    if (error === "password_reset_expired") {
      showToast("That reset link has expired. Request a new one.", "info");
      return;
    }
    showToast("Couldn't sign you in. Only @gmail.com Google accounts are supported.", "error");
  }, [searchParams, showToast, onWrongRegion, router]);

  return null;
}

/** Email + password form, shown only behind NEXT_PUBLIC_PASSWORD_AUTH. */
function PasswordLoginForm({ onBusyChange }: { onBusyChange: (busy: boolean) => void }) {
  const router = useRouter();
  const { showToast } = useToast();
  const captcha = useTurnstile();
  const [email, setEmail] = useRememberedEmail();
  const [password, setPassword] = useState("");
  // A field only complains once the person has left it, and stops the moment it is filled in right.
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const emailError = emailFieldError(email, emailTouched);
  const passwordError = passwordFieldError(password, passwordTouched);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (!looksLikeEmail(email) || password.length === 0) {
      setFailure({ code: "invalid_credentials", message: "Enter your email and password." });
      return;
    }
    setFailure(null);
    setSubmitting(true);
    // The page's "already signed in -> /dashboard" redirect must not fire between the session
    // appearing and finishSignIn() below deciding whether this account may continue.
    onBusyChange(true);

    const result = await signInWithPasswordAcrossRegions(email, password, captcha.getToken);
    if (!result.ok) {
      if (result.failure.code === "email_not_confirmed") {
        rememberPendingAuth({ email: email.trim().toLowerCase(), kind: "email" });
        router.push("/auth/confirm?type=email");
        return;
      }
      setFailure(result.failure);
      setSubmitting(false);
      onBusyChange(false);
      return;
    }

    const finished = await finishSignIn();
    if (finished.kind === "moved") {
      window.location.assign(`/login?error=account_moved&region=${finished.region}`);
      return;
    }
    if (finished.reactivated) showToast("Welcome back — your account was reactivated!", "success");
    // A full load, not router.replace: AuthProvider is bound to the region that was active when
    // it mounted, which is wrong whenever the account turned out to live in the other one.
    window.location.assign("/dashboard");
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="mx-auto flex w-full max-w-[360px] flex-col gap-4 text-left">
      <div>
        <label htmlFor="login-email" className={fieldLabel}>
          Email
        </label>
        <input
          id="login-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onBlur={() => setEmailTouched(true)}
          aria-invalid={emailError ? true : undefined}
          aria-describedby="login-email-error"
          disabled={submitting}
          className={textInput}
        />
        <FieldError id="login-email-error">{emailError}</FieldError>
      </div>
      <div>
        <div className="mb-2 flex items-baseline justify-between">
          <label htmlFor="login-password" className="block text-sm font-bold uppercase tracking-[0.6px] text-text-muted">
            Password
          </label>
          <Link href="/forgot-password" className="text-[0.8rem] font-semibold text-accent-blue hover:underline">
            Forgot password?
          </Link>
        </div>
        <PasswordField
          id="login-password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onBlur={() => setPasswordTouched(true)}
          aria-invalid={passwordError ? true : undefined}
          aria-describedby="login-password-hint"
          disabled={submitting}
        />
        <PasswordMessage id="login-password-hint" error={passwordError} empty={password.length === 0} />
      </div>
      {failure && <FormMessage tone="error">{failure.message}</FormMessage>}
      <Turnstile captcha={captcha} />
      <CaptchaButton
        captcha={captcha}
        type="submit"
        variant="secondary"
        className="w-full"
        loading={submitting}
        disabled={!looksLikeEmail(email) || password.length === 0}
      >
        Log in
      </CaptchaButton>
    </form>
  );
}

export default function LoginPage() {
  const [region, setRegion] = useAuthRegion();
  const [busy, setBusy] = useState(false);
  const { status } = useAuth();
  const router = useRouter();
  const passwordAuth = isPasswordAuthEnabled();

  useEffect(() => {
    if (status === "authed" && !busy) router.replace("/dashboard");
  }, [status, busy, router]);

  if (status !== "anon" && !busy) return <FullScreenLoader />;

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
        <Logo size={AUTH_LOGO_SIZE} className="mx-auto mb-8" />
        {region && <RegionPicker region={region} />}

        <GoogleButton />

        {passwordAuth && (
          <>
            <OrDivider />
            <PasswordLoginForm onBusyChange={setBusy} />
            <p className="mt-6 text-[0.9rem] text-text-muted">
              New here?{" "}
              <Link href="/signup" className="font-bold text-accent-blue hover:underline">
                Create an account
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
