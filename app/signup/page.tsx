"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { fieldLabel, textInput } from "@/app/components/ui/formClasses";
import { AuthLayout, FieldError, FormMessage, OrDivider, PasswordMessage } from "@/app/components/auth/AuthLayout";
import { GoogleButton } from "@/app/components/auth/GoogleButton";
import { PasswordField } from "@/app/components/auth/PasswordField";
import { RegionPicker } from "@/app/components/auth/RegionPicker";
import { CaptchaButton, Turnstile, useTurnstile } from "@/app/components/auth/Turnstile";
import {
  emailFieldError,
  isPasswordAuthEnabled,
  looksLikeEmail,
  passwordFieldError,
  passwordProblem,
  signUpWithPassword,
  type AuthFailure,
} from "@/lib/auth/passwordAuth";
import { clearRememberedEmail } from "@/lib/auth/rememberedEmail";
import { useAuthRegion } from "@/lib/auth/useAuthRegion";
import { useRememberedEmail } from "@/lib/auth/useRememberedEmail";
import { setActiveRegion } from "@/lib/supabase/regions";

export default function SignUpPage() {
  const router = useRouter();
  const { status } = useAuth();
  const [region] = useAuthRegion();
  const captcha = useTurnstile();
  const [email, setEmail] = useRememberedEmail();
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  // A field only complains once the person has left it, and stops the moment it is filled in right.
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const enabled = isPasswordAuthEnabled();
  const emailError = emailFieldError(email, emailTouched);
  const passwordValid = passwordProblem(password) === null;
  const passwordError = passwordFieldError(password, passwordTouched);

  useEffect(() => {
    // The form only exists once the Dashboard side is ready (NEXT_PUBLIC_PASSWORD_AUTH).
    if (!enabled) router.replace("/login");
  }, [enabled, router]);

  useEffect(() => {
    if (status === "authed" && !submitting) router.replace("/dashboard");
  }, [status, submitting, router]);

  if (!enabled || status !== "anon") return <FullScreenLoader />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (!looksLikeEmail(email)) {
      setFailure({ code: "invalid_email", message: "Enter a valid email address." });
      return;
    }
    const problem = passwordProblem(password);
    if (problem) {
      setFailure({ code: "weak_password", message: problem });
      return;
    }
    if (!acceptedTerms) {
      setFailure({ code: "unknown", message: "Please accept the Terms and the Privacy Policy to continue." });
      return;
    }

    setFailure(null);
    setSubmitting(true);
    const result = await signUpWithPassword(email, password, captcha.getToken);
    if (!result.ok) {
      if (result.failure.code === "wrong_region" && result.failure.region) {
        // The email already has an account in the other region -- send them to log in there. A full
        // load (not router.push) so the auth client is rebuilt for that region.
        setActiveRegion(result.failure.region);
        window.location.assign(`/login?error=wrong_region&region=${result.failure.region}`);
        return;
      }
      setFailure(result.failure);
      setSubmitting(false);
      return;
    }
    // Registered: the code screen gets the email from its own pending-auth storage.
    clearRememberedEmail();
    if (result.signedIn) {
      // Only when the Dashboard's "Confirm email" is off -- the session already exists.
      window.location.assign("/dashboard");
      return;
    }
    // Supabase answers identically whether or not the email already had an account, so this goes to
    // the same "enter your code" screen in both cases.
    router.push("/auth/confirm?type=email");
  }

  return (
    <AuthLayout>
      {region && <RegionPicker region={region} />}
      <div className="flex justify-center">
        <GoogleButton disabled={submitting} />
      </div>
      <OrDivider />
      <form onSubmit={handleSubmit} noValidate className="mx-auto flex w-full max-w-[360px] flex-col gap-4 text-left">
        <div>
          <label htmlFor="signup-email" className={fieldLabel}>
            Email
          </label>
          <input
            id="signup-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmailTouched(true)}
            aria-invalid={emailError ? true : undefined}
            aria-describedby="signup-email-error"
            disabled={submitting}
            className={textInput}
          />
          <FieldError id="signup-email-error">{emailError}</FieldError>
        </div>
        <div>
          <label htmlFor="signup-password" className={fieldLabel}>
            Password
          </label>
          <PasswordField
            id="signup-password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setPasswordTouched(true)}
            aria-invalid={passwordError ? true : undefined}
            aria-describedby="signup-password-hint"
            disabled={submitting}
          />
          <PasswordMessage id="signup-password-hint" error={passwordError} empty={password.length === 0} />
        </div>
        <label className="flex cursor-pointer items-start gap-2.5 text-[0.85rem] leading-normal text-text-muted">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            disabled={submitting}
            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent-red)]"
          />
          <span>
            I agree to the{" "}
            <Link href="/terms" target="_blank" className="font-semibold text-accent-blue hover:underline">
              Terms
            </Link>{" "}
            and the{" "}
            <Link href="/privacy" target="_blank" className="font-semibold text-accent-blue hover:underline">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
        {failure && <FormMessage tone="error">{failure.message}</FormMessage>}
        <Turnstile captcha={captcha} />
        <CaptchaButton
          captcha={captcha}
          type="submit"
          variant="secondary"
          className="w-full"
          loading={submitting}
          disabled={!looksLikeEmail(email) || !passwordValid || !acceptedTerms}
        >
          Create account
        </CaptchaButton>
      </form>
      <p className="mt-6 text-center text-[0.9rem] text-text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-bold text-accent-blue hover:underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
