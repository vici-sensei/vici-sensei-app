"use client";

import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { AuthLayout } from "@/app/components/auth/AuthLayout";
import { AuthForm } from "@/app/components/auth/AuthForm";
import { AuthFooter, AuthLink } from "@/app/components/auth/AuthLink";
import { EmailField } from "@/app/components/auth/AuthFields";
import { useTurnstile } from "@/app/components/auth/Turnstile";
import {
  looksLikeEmail,
  requestPasswordReset,
} from "@/lib/auth/passwordAuth";
import { useAuthSubmit } from "@/lib/auth/useAuthSubmit";
import { useRequirePasswordAuth } from "@/lib/auth/useRequirePasswordAuth";
import { useRememberedEmail } from "@/lib/auth/useRememberedEmail";

export default function ForgotPasswordPage() {
  const router = useRouter();
  const [email, setEmail] = useRememberedEmail();
  const { submitting, failure, setFailure, submit } = useAuthSubmit();
  const enabled = useRequirePasswordAuth();
  // The security card only slides in once there is something to submit.
  const captcha = useTurnstile(looksLikeEmail(email));

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
      <AuthForm
        onSubmit={handleSubmit}
        className="gap-4"
        submitting={submitting}
        failure={failure}
        captcha={captcha}
        submitLabel="Send reset email"
        submitVariant="secondary"
        submitDisabled={!looksLikeEmail(email)}
      >
        <EmailField id="forgot-email" value={email} onChange={setEmail} />
      </AuthForm>
      <AuthFooter>
        <AuthLink href="/login">Back to log in</AuthLink>
      </AuthFooter>
    </AuthLayout>
  );
}
