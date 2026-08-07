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

    // getSession()/the INITIAL_SESSION event just read whatever token is cached in
    // localStorage without checking it's still valid server-side. If the referenced user
    // no longer exists (e.g. the DB was reset), that stale token would otherwise leave us
    // stuck in an "authed" state with no matching DB rows, surfacing raw Postgres errors
    // instead of bouncing to /login. getUser() revalidates against the auth server, so we
    // use it for the initial check and sign out locally if it comes back invalid.
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
