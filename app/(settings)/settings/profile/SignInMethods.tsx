"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { cancelEmailChange, startEmailChange } from "@/lib/client-data/account";
import {
  confirmCurrentPassword,
  looksLikeEmail,
  normalizeEmail,
  passwordProblem,
  requestEmailChange,
  updatePassword,
} from "@/lib/auth/passwordAuth";
import { useAuthSubmit } from "@/lib/auth/useAuthSubmit";
import { useToast } from "@/app/components/ui/Toast";
import { Button } from "@/app/components/ui/Button";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { fieldLabel } from "@/app/components/ui/formClasses";
import { AuthForm } from "@/app/components/auth/AuthForm";
import { EmailField, PasswordFormField } from "@/app/components/auth/AuthFields";
import { useTurnstile } from "@/app/components/auth/Turnstile";

/** The box the two forms below open in, inside the "Sign-in methods" list. */
const FORM_CARD = "gap-3.5 rounded-lg border border-border-soft bg-white/[0.03] p-3.5";

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

        {/* The form replaces this row while it is open, so "Password" is never on screen twice
            (and "Not set" never sits above the box that is setting it). */}
        {!(open === "password" && hasPassword !== null) && (
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
              <Button type="button" variant="secondary" size="sm" onClick={() => setOpen("password")}>
                {hasPassword ? "Change password" : "Add a password"}
              </Button>
            )}
          </div>
        )}
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
  const { submitting, failure, setFailure, submit, stop } = useAuthSubmit();
  const formComplete = passwordProblem(next) === null && (!hasPassword || current.length > 0);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (hasPassword && current.length === 0) {
      setFailure({ code: "invalid_credentials", message: "Enter your current password." });
      return;
    }
    const problem = passwordProblem(next);
    if (problem) {
      setFailure({ code: "weak_password", message: problem });
      return;
    }

    const result = await submit(async () => {
      if (hasPassword) {
        const confirmed = await confirmCurrentPassword(email, current, captcha.getToken);
        if (!confirmed.ok) return confirmed;
      }
      return updatePassword(next);
    });
    if (!result) return;
    showToast(hasPassword ? "Password updated" : "Password added", "success");
    stop();
    onDone();
  }

  return (
    <AuthForm
      onSubmit={handleSubmit}
      className={FORM_CARD}
      submitting={submitting}
      failure={failure}
      captcha={captcha}
      submitLabel="Save password"
      submitDisabled={!formComplete}
      onCancel={onClose}
    >
      {hasPassword && (
        <PasswordFormField
          id="settings-current-password"
          label="Current password"
          autoComplete="current-password"
          value={current}
          onChange={setCurrent}
          validate={false}
          autoFocus
        />
      )}
      <PasswordFormField
        id="settings-new-password"
        label={hasPassword ? "New password" : "Password"}
        autoComplete="new-password"
        value={next}
        onChange={setNext}
        autoFocus={!hasPassword}
      />
    </AuthForm>
  );
}

function ChangeEmailForm({ email, onClose }: { email: string; onClose: () => void }) {
  const router = useRouter();
  const captcha = useTurnstile();
  const [newEmail, setNewEmail] = useState("");
  const [password, setPassword] = useState("");
  const { submitting, failure, setFailure, submit } = useAuthSubmit();

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
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

    const result = await submit(async () => {
      const confirmed = await confirmCurrentPassword(email, password, captcha.getToken);
      if (!confirmed.ok) return confirmed;

      // Order matters: claim the address in the region ledger first, so a refusal costs nothing, then
      // ask Supabase to send the confirmation. If Supabase refuses after the claim, give the claim back.
      try {
        await startEmailChange(newEmail);
      } catch (err) {
        const message = err instanceof ApiError ? err.message : "Something went wrong. Please try again.";
        return { ok: false as const, failure: { code: "unknown" as const, message } };
      }
      const changed = await requestEmailChange(newEmail);
      if (!changed.ok) await cancelEmailChange();
      return changed;
    });
    if (!result) return;
    router.push("/auth/confirm?type=email_change");
  }

  return (
    <AuthForm
      onSubmit={handleSubmit}
      className={FORM_CARD}
      submitting={submitting}
      failure={failure}
      captcha={captcha}
      submitLabel="Send code"
      onCancel={onClose}
    >
      <EmailField
        id="settings-new-email"
        label="New email"
        value={newEmail}
        onChange={setNewEmail}
        validate={false}
        hint="We'll send a code to the new address. Your email only changes once you confirm it."
      />
      <PasswordFormField
        id="settings-email-password"
        label="Current password"
        autoComplete="current-password"
        value={password}
        onChange={setPassword}
        validate={false}
      />
    </AuthForm>
  );
}
