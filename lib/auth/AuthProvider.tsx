"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/auth-js";
import { createClient } from "@/lib/supabase/client";

type AuthStatus = "loading" | "authed" | "anon";

interface AuthState {
  status: AuthStatus;
  user: User | null;
}

const AuthContext = createContext<AuthState | null>(null);

// Every downstream hook that fetches per-user data (useStudySettings, useUserProfile,
// StudyStatsProvider, etc.) keys its effect on this `user` object by reference, not on
// `user.id` -- so handing out a new object for the same underlying user makes every one of
// them refetch for nothing. That happens naturally here: getSession() (local) and getUser()
// (server-verified) each resolve with their own freshly-parsed User object, and
// onAuthStateChange fires again on every token refresh. Reusing the previous object whenever
// the id hasn't changed keeps those effects from ever seeing a "new" user when it's the same
// one, without having to touch every consumer's dependency array.
function sameUser(prev: User | null, next: User | null): User | null {
  return prev && next && prev.id === next.id ? prev : next;
}

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
      setState((prev) => ({ status: "authed", user: sameUser(prev.user, data.user) }));
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "INITIAL_SESSION") return;
      setState((prev) => ({ status: session ? "authed" : "anon", user: sameUser(prev.user, session?.user ?? null) }));
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
