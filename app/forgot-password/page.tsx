"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/app/components/ui/Button";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { fieldLabel, textInput } from "@/app/components/ui/formClasses";
import { AuthLayout, FieldError, FormMessage } from "@/app/components/auth/AuthLayout";
import { Turnstile, type TurnstileHandle } from "@/app/components/auth/Turnstile";
import {
  isPasswordAuthEnabled,
  emailFieldError,
  looksLikeEmail,
  requestPasswordReset,
  type AuthFailure,
} from "@/lib/auth/passwordAuth";
import { useRememberedEmail } from "@/lib/auth/useRememberedEmail";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const captchaRef = useRef<TurnstileHandle>(null);
  const [email, setEmail] = useRememberedEmail();
  // The field only complains once the person has left it, and stops the moment it is filled in right.
  const [emailTouched, setEmailTouched] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<AuthFailure | null>(null);
  const enabled = isPasswordAuthEnabled();
  const emailError = emailFieldError(email, emailTouched);

  useEffect(() => {
    if (!enabled) router.replace("/login");
  }, [enabled, router]);

  if (!enabled) return <FullScreenLoader />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (!looksLikeEmail(email)) {
      setFailure({ code: "invalid_email", message: "Enter a valid email address." });
      return;
    }
    setFailure(null);
    setSubmitting(true);
    const result = await requestPasswordReset(email, async () => captchaRef.current?.getToken());
    if (!result.ok) {
      setFailure(result.failure);
      setSubmitting(false);
      return;
    }
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
        <Turnstile ref={captchaRef} />
        <Button
          type="submit"
          variant="secondary"
          className="w-full"
          loading={submitting}
          disabled={!looksLikeEmail(email)}
        >
          Send reset email
        </Button>
      </form>
      <p className="mt-6 text-center text-[0.9rem] text-text-muted">
        <Link href="/login" className="font-bold text-accent-blue hover:underline">
          Back to log in
        </Link>
      </p>
    </AuthLayout>
  );
}
