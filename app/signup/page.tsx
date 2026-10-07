"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FaCheck } from "react-icons/fa6";
import { useAuth } from "@/lib/auth/AuthProvider";
import { buttonClasses } from "@/app/components/ui/Button";
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
  normalizeEmail,
  passwordFieldError,
  passwordProblem,
  signUpWithPassword,
  type AuthFailure,
} from "@/lib/auth/passwordAuth";
import { clearRememberedEmail } from "@/lib/auth/rememberedEmail";
import { useAuthRegion } from "@/lib/auth/useAuthRegion";
import { useRememberedEmail } from "@/lib/auth/useRememberedEmail";
import { useOnPageRestored } from "@/lib/useOnPageRestored";
import { setActiveRegion } from "@/lib/supabase/regions";

/** What replaces the whole form once the account exists: just the logo, a green check and the way on.
 * The button goes straight to the code page (signUp already remembered the email for it), not to /login:
 * entering the code signs the person in, so a separate log-in step would only get in the way. */
function RegisteredNotice({ email }: { email: string }) {
  return (
    <AuthLayout>
      <div role="status" className="text-center">
        <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full border border-accent-green/30 bg-accent-green/10">
          <FaCheck aria-hidden="true" className="h-7 w-7 text-accent-green" />
        </div>
        <h1 className="mb-2 text-[1.9rem] font-extrabold leading-tight tracking-[-0.5px]">You&apos;re almost in!</h1>
        <p className="mb-7 text-[0.95rem] leading-[1.6] text-text-muted">
          We sent a 6-digit code to <strong className="break-all text-white">{email}</strong>. Pop it in on the next
          page and you&apos;re good to go.
        </p>
      </div>
      <Link
        href="/auth/confirm?type=email"
        className={buttonClasses({ variant: "secondary", hover: "hover", className: "w-full" })}
      >
        Enter my code
      </Link>
    </AuthLayout>
  );
}

export default function SignUpPage() {
  const router = useRouter();
  const { status } = useAuth();
  const [region] = useAuthRegion();
  const [email, setEmail] = useRememberedEmail();
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  // A field only complains once the person has left it, and stops the moment it is filled in right.
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  // Set once the account is created and still needs its email confirmed: swaps the form for RegisteredNotice.
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const enabled = isPasswordAuthEnabled();
  const emailError = emailFieldError(email, emailTouched);
  const passwordValid = passwordProblem(password) === null;
  const passwordError = passwordFieldError(password, passwordTouched);
  // The security card only slides in once there is something to submit.
  const formComplete = looksLikeEmail(email) && passwordValid && acceptedTerms;
  const captcha = useTurnstile(formComplete);

  // Back from the full-page load to /dashboard (account created with no email confirmation)
  // restores this form from bfcache still submitting.
  useOnPageRestored(() => setSubmitting(false));

  useEffect(() => {
    // The form only exists once the Dashboard side is ready (NEXT_PUBLIC_PASSWORD_AUTH).
    if (!enabled) router.replace("/login");
  }, [enabled, router]);

  useEffect(() => {
    if (status === "authed" && !submitting) router.replace("/dashboard");
  }, [status, submitting, router]);

  if (!enabled || status !== "anon") return <FullScreenLoader />;
  if (registeredEmail) return <RegisteredNotice email={registeredEmail} />;

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
      // A `wrong_region` failure (the email already has an account in the other region) stays on this
      // page: the message says so and offers "Log in", which is what switches the region.
      setFailure(result.failure);
      setSubmitting(false);
      return;
    }
    clearRememberedEmail();
    if (result.signedIn) {
      // Only when the Dashboard's "Confirm email" is off -- the session already exists.
      window.location.assign("/dashboard");
      return;
    }
    // Supabase answers identically whether or not the email already had an account, so everyone gets
    // the same screen. The code from the email is still entered on /auth/confirm: logging in with the
    // unconfirmed account sends the person there (and so does the link in the email itself).
    setRegisteredEmail(normalizeEmail(email));
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
        {failure?.code === "wrong_region" && failure.region && (
          <button
            type="button"
            onClick={() => {
              // A full load (not router.push) so the auth client is rebuilt for that region.
              setActiveRegion(failure.region!);
              window.location.assign("/login");
            }}
            className={buttonClasses({ variant: "secondary", hover: "hover", className: "w-full" })}
          >
            Log in
          </button>
        )}
        <Turnstile captcha={captcha} />
        <CaptchaButton
          captcha={captcha}
          type="submit"
          variant="secondary"
          className="w-full"
          loading={submitting}
          disabled={!formComplete}
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
