"use client";

import { useState } from "react";
import { FcGoogle } from "react-icons/fc";
import { createClient } from "@/lib/supabase/client";

type LoginState = "idle" | "loading" | "error";

export default function LoginPage() {
  const [state, setState] = useState<LoginState>("idle");

  async function handleGoogleLogin() {
    setState("loading");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
        queryParams: {
          access_type: "offline",
          prompt: "select_account",
        },
      },
    });

    if (error) {
      setState("error");
    }
    // On success the browser navigates away to Google — no further state change needed.
  }

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 8h20M4 8v13M20 8v13M7 3c0 2.5 2 4 5 4s5-1.5 5-4" />
          </svg>
          Vici Sensei
        </div>
        <span className="badge">Spaced repetition, Anki style</span>
        <h1 className="main-title" style={{ fontSize: "2.6rem" }}>
          Learn Japanese
          <br />
          at your own pace.
        </h1>
        <p className="subtitle">
          Kanji, readings, and vocabulary organized by JLPT level, scheduled for exactly when your brain needs to
          see them again.
        </p>

        <button
          type="button"
          className={`btn-primary${state === "loading" ? " is-loading" : ""}`}
          style={{ width: "100%", maxWidth: 360 }}
          onClick={handleGoogleLogin}
          disabled={state === "loading"}
        >
          <span className="spinner" style={state === "loading" ? { display: "inline-block" } : undefined} />
          <FcGoogle className="google-btn-icon" />
          <span className="btn-label">Continue with Google</span>
        </button>

        <div className={`login-error${state === "error" ? " show" : ""}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>Sign-in failed. Please try again.</span>
          <span className="retry-link" onClick={handleGoogleLogin}>
            Retry
          </span>
        </div>

        <p className="login-footnote">No passwords. Secure sign-in exclusively through your Google account.</p>
      </div>
    </div>
  );
}
