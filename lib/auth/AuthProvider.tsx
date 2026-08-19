"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

type AuthStatus = "loading" | "authed" | "anon";

interface AuthState {
  status: AuthStatus;
  user: User | null;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: "loading", user: null });

  useEffect(() => {
    const supabase = createClient();

    // getSession() just reads whatever token is cached in localStorage, with no network
    // round trip -- paint optimistically with it so authed users see real content
    // immediately instead of a loading state on every cold load. It doesn't check the
    // token is still valid server-side, so getUser() (fired in parallel below) revalidates
    // against the auth server and is the one that's allowed to overwrite an already-settled
    // state: if it comes back invalid (e.g. the DB was reset and the user no longer exists),
    // we sign out locally and bounce to /login. Until then, RLS rejects any query for an
    // invalid user regardless of what this optimistic state believes, so the only thing at
    // stake is how long stale UI is visible, not what data can actually be read.
    supabase.auth.getSession().then(({ data }) => {
      setState((prev) =>
        prev.status === "loading"
          ? { status: data.session ? "authed" : "anon", user: data.session?.user ?? null }
          : prev
      );
    });

    supabase.auth.getUser().then(({ data, error }) => {
      if (error || !data.user) {
        void supabase.auth.signOut();
        setState({ status: "anon", user: null });
        return;
      }
      setState({ status: "authed", user: data.user });
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;
      setState({ status: session ? "authed" : "anon", user: session?.user ?? null });
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  return <AuthContext.Provider value={state}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
