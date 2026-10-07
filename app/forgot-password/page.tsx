"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { fieldLabel, textInput } from "@/app/components/ui/formClasses";
import { AuthLayout, FieldError, FormMessage } from "@/app/components/auth/AuthLayout";
import { CaptchaButton, Turnstile, useTurnstile } from "@/app/components/auth/Turnstile";
import {
  isPasswordAuthEnabled,
  emailFieldError,
  looksLikeEmail,
  requestPasswordReset,
} from "@/lib/auth/passwordAuth";
import { useAuthSubmit } from "@/lib/auth/useAuthSubmit";
import { useRememberedEmail } from "@/lib/auth/useRememberedEmail";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useRememberedEmail();
  // The field only complains once the person has left it, and stops the moment it is filled in right.
  const [emailTouched, setEmailTouched] = useState(false);
  const { submitting, failure, setFailure, submit } = useAuthSubmit();
  const enabled = isPasswordAuthEnabled();
  const emailError = emailFieldError(email, emailTouched);
  // The security card only slides in once there is something to submit.
  const captcha = useTurnstile(looksLikeEmail(email));

  useEffect(() => {
    if (!enabled) router.replace("/login");
  }, [enabled, router]);

  if (!enabled) return <FullScreenLoader />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!looksLikeEmail(email)) {
      setFailure({ code: "invalid_email", message: "Enter a valid email address." });
      return;
    }
    const result = await submit(() => requestPasswordReset(email, captcha.getToken));
    if (!result) return;
    // Same screen whether or not the email has an account -- the next page says "if an account
    // exists", and never confirms either way.
    router.push("/auth/confirm?type=recovery");
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter the email you signed up with and we'll send you a code and a link."
    >
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 text-left">
        <div>
          <label htmlFor="forgot-email" className={fieldLabel}>
            Email
          </label>
          <input
            id="forgot-email"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setEmailTouched(true)}
            aria-invalid={emailError ? true : undefined}
            aria-describedby="forgot-email-error"
            disabled={submitting}
            className={textInput}
          />
          <FieldError id="forgot-email-error">{emailError}</FieldError>
        </div>
        {failure && <FormMessage tone="error">{failure.message}</FormMessage>}
        <Turnstile captcha={captcha} />
        <CaptchaButton
          captcha={captcha}
          type="submit"
          variant="secondary"
          className="w-full"
          loading={submitting}
          disabled={!looksLikeEmail(email)}
        >
          Send reset email
        </CaptchaButton>
      </form>
      <p className="mt-6 text-center text-[0.9rem] text-text-muted">
        <Link href="/login" className="font-bold text-accent-blue hover:underline">
          Back to log in
        </Link>
      </p>
    </AuthLayout>
  );
}
