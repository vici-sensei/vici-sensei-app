"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useToast } from "@/app/components/ui/Toast";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { AuthLayout } from "@/app/components/auth/AuthLayout";
import { AuthForm } from "@/app/components/auth/AuthForm";
import { PasswordFormField } from "@/app/components/auth/AuthFields";
import {
  isPasswordAuthEnabled,
  passwordProblem,
  updatePassword,
} from "@/lib/auth/passwordAuth";
import { useAuthSubmit } from "@/lib/auth/useAuthSubmit";

/**
 * Where /auth/confirm sends a verified recovery token: the token already signed the person in (that
 * is how Supabase recovery works), so all that is left is choosing the new password. Without a
 * session -- the link was never opened, expired, or this is a stray visit -- there is nothing to
 * reset and the page says so.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { status } = useAuth();
  const [password, setPassword] = useState("");
  const { submitting, failure, setFailure, submit } = useAuthSubmit();
  const enabled = isPasswordAuthEnabled();

  useEffect(() => {
    if (!enabled) router.replace("/login");
  }, [enabled, router]);

  if (!enabled || status === "loading") return <FullScreenLoader />;

  if (status === "anon") {
    return (
      <AuthLayout
        title="This link has expired"
        subtitle="Reset links work once and only for a short time. Request a new one and try again."
      >
        <div className="flex flex-col gap-3">
          <Link
            href="/forgot-password"
            className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-accent-red px-8 py-[15px] text-base font-bold text-white shadow-[0_0_30px_rgba(255,74,90,0.4)]"
          >
            Request a new link
          </Link>
          <Link href="/login" className="text-center text-[0.9rem] text-text-muted hover:text-white">
            Back to log in
          </Link>
        </div>
      </AuthLayout>
    );
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const problem = passwordProblem(password);
    if (problem) {
      setFailure({ code: "weak_password", message: problem });
      return;
    }
    const result = await submit(() => updatePassword(password));
    if (!result) return;
    // A reset is usually "someone else may have it": end every other session of this account.
    await createClient().auth.signOut({ scope: "others" });
    showToast("Password updated", "success");
    router.replace("/dashboard");
  }

  return (
    <AuthLayout title="Choose a new password" subtitle="You'll use it the next time you log in with your email.">
      <AuthForm
        onSubmit={handleSubmit}
        className="gap-4"
        submitting={submitting}
        failure={failure}
        submitLabel="Save password"
      >
        <PasswordFormField
          id="reset-password"
          label="New password"
          autoComplete="new-password"
          value={password}
          onChange={setPassword}
        />
      </AuthForm>
    </AuthLayout>
  );
}
