"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ApiError } from "@/lib/api/client";
import { cancelEmailChange, startEmailChange } from "@/lib/client-data/account";
import {
  confirmCurrentPassword,
  looksLikeEmail,
  MIN_PASSWORD_LENGTH,
  normalizeEmail,
  passwordProblem,
  requestEmailChange,
  updatePassword,
  type AuthFailure,
} from "@/lib/auth/passwordAuth";
import { useToast } from "@/app/components/ui/Toast";
import { Button } from "@/app/components/ui/Button";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { fieldHint, fieldLabel, textInput } from "@/app/components/ui/formClasses";
import { FormMessage } from "@/app/components/auth/AuthLayout";
import { PasswordField } from "@/app/components/auth/PasswordField";
import { CaptchaButton, Turnstile, useTurnstile } from "@/app/components/auth/Turnstile";

/** Email + password half of "Sign-in methods" (the Google half stays in ProfileSettingsForm).
 * Rendered only behind NEXT_PUBLIC_PASSWORD_AUTH. `hasPassword` is `null` while it loads (or when it
 * couldn't be determined), in which case nothing here offers an action. */
export function SignInMethods({
  email,
  hasPassword,
  onPasswordSet,
  loading,
}: {
  email: string;
  hasPassword: boolean | null;
  onPasswordSet: () => void;
  loading: boolean;
}) {
  const [open, setOpen] = useState<"password" | "email" | null>(null);

  return (
    <div>
      <label className={fieldLabel}>Email &amp; password</label>
      <div className="flex flex-col gap-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-border-soft bg-white/[0.02] px-3.5 py-3">
          <div className="min-w-0">
            <div className="text-[0.8rem] text-text-muted">Email</div>
            {loading ? (
              <Skeleton className="mt-1 h-4 w-44 max-w-full rounded-md" />
            ) : (
              <div className="truncate text-[0.95rem] text-white">{email}</div>
            )}
          </div>
          {hasPassword && (
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(open === "email" ? null : "email")}>
              Change email
            </Button>
          )}
        </div>
        {open === "email" && hasPassword && <ChangeEmailForm email={email} onClose={() => setOpen(null)} />}

        <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-lg border border-border-soft bg-white/[0.02] px-3.5 py-3">
          <div className="min-w-0">
            <div className="text-[0.8rem] text-text-muted">Password</div>
            {hasPassword === null ? (
              <Skeleton className="mt-1 h-4 w-28 rounded-md" />
            ) : (
              <div className="text-[0.95rem] text-white">{hasPassword ? "••••••••••" : "Not set"}</div>
            )}
          </div>
          {hasPassword !== null && (
            <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(open === "password" ? null : "password")}>
              {hasPassword ? "Change password" : "Add a password"}
            </Button>
          )}
        </div>
        {open === "password" && hasPassword !== null && (
          <PasswordForm
            email={email}
            hasPassword={hasPassword}
            onDone={() => {
              setOpen(null);
              onPasswordSet();
            }}
            onClose={() => setOpen(null)}
          />
        )}
      </div>
      {hasPassword === false && (
        <p className={fieldHint}>
          Add a password to also log in with your email, not only Google. You can always still use Google.
        </p>
      )}
    </div>
  );
}

function PasswordForm({
  email,
  hasPassword,
  onDone,
  onClose,
}: {
  email: string;
  hasPassword: boolean;
  onDone: () => void;
  onClose: () => void;
}) {
  const { showToast } = useToast();
  const captcha = useTurnstile();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<AuthFailure | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (hasPassword && current.length === 0) {
      setFailure({ code: "invalid_credentials", message: "Enter your current password." });
      return;
    }
    const problem = passwordProblem(next);
    if (problem) {
      setFailure({ code: "weak_password", message: problem });
      return;
    }
    setFailure(null);
    setSubmitting(true);

    if (hasPassword) {
      const confirmed = await confirmCurrentPassword(email, current, captcha.getToken);
      if (!confirmed.ok) {
        setFailure(confirmed.failure);
        setSubmitting(false);
        return;
      }
    }
    const result = await updatePassword(next);
    if (!result.ok) {
      setFailure(result.failure);
      setSubmitting(false);
      return;
    }
    // Changing a password is usually "someone else may have it": sign every other device out.
    await createClient().auth.signOut({ scope: "others" });
    showToast(hasPassword ? "Password updated" : "Password added", "success");
    setSubmitting(false);
    onDone();
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3.5 rounded-lg border border-border-soft bg-white/[0.03] p-3.5">
      {hasPassword && (
        <div>
          <label htmlFor="settings-current-password" className={fieldLabel}>
            Current password
          </label>
          <PasswordField
            id="settings-current-password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            disabled={submitting}
          />
        </div>
      )}
      <div>
        <label htmlFor="settings-new-password" className={fieldLabel}>
          {hasPassword ? "New password" : "Password"}
        </label>
        <PasswordField
          id="settings-new-password"
          autoComplete="new-password"
          value={next}
          onChange={(e) => setNext(e.target.value)}
          disabled={submitting}
        />
        <p className={fieldHint}>At least {MIN_PASSWORD_LENGTH} characters, with letters and digits.</p>
      </div>
      {failure && <FormMessage tone="error">{failure.message}</FormMessage>}
      <Turnstile captcha={captcha} />
      <div className="flex gap-2.5">
        <CaptchaButton captcha={captcha} type="submit" size="sm" loading={submitting}>
          Save password
        </CaptchaButton>
        <Button type="button" variant="secondary" size="sm" disabled={submitting} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function ChangeEmailForm({ email, onClose }: { email: string; onClose: () => void }) {
  const router = useRouter();
  const captcha = useTurnstile();
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<AuthFailure | null>(null);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (submitting) return;
    if (!looksLikeEmail(newEmail)) {
      setFailure({ code: "invalid_email", message: "Enter a valid email address." });
      return;
    }
    if (normalizeEmail(newEmail) === normalizeEmail(email)) {
      setFailure({ code: "invalid_email", message: "That's already your email address." });
      return;
    }
    if (password.length === 0) {
      setFailure({ code: "invalid_credentials", message: "Enter your current password." });
      return;
    }
    setFailure(null);
    setSubmitting(true);

    const confirmed = await confirmCurrentPassword(email, password, captcha.getToken);
    if (!confirmed.ok) {
      setFailure(confirmed.failure);
      setSubmitting(false);
      return;
    }

    // Order matters: claim the address in the region ledger first, so a refusal costs nothing, then
    // ask Supabase to send the confirmation. If Supabase refuses after the claim, give the claim back.
    try {
      await startEmailChange(newEmail);
    } catch (err) {
      setFailure({ code: "unknown", message: err instanceof ApiError ? err.message : "Something went wrong. Please try again." });
      setSubmitting(false);
      return;
    }
    const result = await requestEmailChange(newEmail);
    if (!result.ok) {
      await cancelEmailChange();
      setFailure(result.failure);
      setSubmitting(false);
      return;
    }
    router.push("/auth/confirm?type=email_change");
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3.5 rounded-lg border border-border-soft bg-white/[0.03] p-3.5">
      <div>
        <label htmlFor="settings-new-email" className={fieldLabel}>
          New email
        </label>
        <input
          id="settings-new-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          spellCheck={false}
          value={newEmail}
          onChange={(e) => setNewEmail(e.target.value)}
          disabled={submitting}
          className={textInput}
        />
        <p className={fieldHint}>We&apos;ll send a code to the new address. Your email only changes once you confirm it.</p>
      </div>
      <div>
        <label htmlFor="settings-email-password" className={fieldLabel}>
          Current password
        </label>
        <PasswordField
          id="settings-email-password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          disabled={submitting}
        />
      </div>
      {failure && <FormMessage tone="error">{failure.message}</FormMessage>}
      <Turnstile captcha={captcha} />
      <div className="flex gap-2.5">
        <CaptchaButton captcha={captcha} type="submit" size="sm" loading={submitting}>
          Send code
        </CaptchaButton>
        <Button type="button" variant="secondary" size="sm" disabled={submitting} onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
