"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { FaCheck } from "react-icons/fa6";
import { buttonClasses } from "@/app/components/ui/Button";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { AuthLayout, OrDivider } from "@/app/components/auth/AuthLayout";
import { AuthForm } from "@/app/components/auth/AuthForm";
import { EmailField, PasswordFormField } from "@/app/components/auth/AuthFields";
import { GoogleButton } from "@/app/components/auth/GoogleButton";
import { RegionPicker } from "@/app/components/auth/RegionPicker";
import { StatusIcon } from "@/app/components/auth/StatusNotice";
import { useTurnstile } from "@/app/components/auth/Turnstile";
import {
  looksLikeEmail,
  normalizeEmail,
  passwordProblem,
  signUpWithPassword,
} from "@/lib/auth/passwordAuth";
import { clearRememberedEmail } from "@/lib/auth/rememberedEmail";
import { useAuthRegion } from "@/lib/auth/useAuthRegion";
import { useAuthSubmit } from "@/lib/auth/useAuthSubmit";
import { useRedirectIfAuthed } from "@/lib/auth/useRedirectIfAuthed";
import { useRequirePasswordAuth } from "@/lib/auth/useRequirePasswordAuth";
import { useRememberedEmail } from "@/lib/auth/useRememberedEmail";
import { setActiveRegion } from "@/lib/supabase/regions";

/** What replaces the whole form once the account exists: just the logo, a green check and the way on.
 * The button goes straight to the code page (signUp already remembered the email for it), not to /login:
 * entering the code signs the person in, so a separate log-in step would only get in the way. */
function RegisteredNotice({ email }: { email: string }) {
  return (
    <AuthLayout>
      <div role="status" className="text-center">
        <StatusIcon icon={FaCheck} tone="green" />
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
  const [region] = useAuthRegion();
  const [email, setEmail] = useRememberedEmail();
  const [password, setPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const { submitting, failure, setFailure, submit } = useAuthSubmit();
  // The form only exists once the Dashboard side is ready (NEXT_PUBLIC_PASSWORD_AUTH).
  const enabled = useRequirePasswordAuth();
  const status = useRedirectIfAuthed(submitting);
  // Set once the account is created and still needs its email confirmed: swaps the form for RegisteredNotice.
  const [registeredEmail, setRegisteredEmail] = useState<string | null>(null);
  const passwordValid = passwordProblem(password) === null;
  // The security card only slides in once there is something to submit.
  const formComplete = looksLikeEmail(email) && passwordValid && acceptedTerms;
  const captcha = useTurnstile(formComplete);

  if (!enabled || status !== "anon") return <FullScreenLoader />;
  if (registeredEmail) return <RegisteredNotice email={registeredEmail} />;

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
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

    // A `wrong_region` failure (the email already has an account in the other region) stays on this
    // page: the message says so and offers "Log in", which is what switches the region.
    const result = await submit(() => signUpWithPassword(email, password, captcha.getToken));
    if (!result) return;
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
      <GoogleButton disabled={submitting} />
      <OrDivider />
      <AuthForm
        onSubmit={handleSubmit}
        className="mx-auto w-full max-w-[360px] gap-4"
        submitting={submitting}
        failure={failure}
        notice={
          failure?.code === "wrong_region" &&
          failure.region && (
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
          )
        }
        captcha={captcha}
        submitLabel="Create account"
        submitVariant="secondary"
        submitDisabled={!formComplete}
      >
        <EmailField id="signup-email" value={email} onChange={setEmail} />
        <PasswordFormField id="signup-password" autoComplete="new-password" value={password} onChange={setPassword} />
        <label className="flex cursor-pointer items-start gap-2.5 text-[0.85rem] leading-normal text-text-muted">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
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
      </AuthForm>
      <p className="mt-6 text-center text-[0.9rem] text-text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-bold text-accent-blue hover:underline">
          Log in
        </Link>
      </p>
    </AuthLayout>
  );
}
