"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import type { StudySettings } from "@/lib/types";

interface StudyOnboardingContextValue {
  user: User;
  settings: StudySettings;
}

const StudyOnboardingContext = createContext<StudyOnboardingContextValue | null>(null);

/** StudyLayout only renders children once useRequireOnboarded() has a confirmed user and
 * loaded settings, so both are handed down here instead of /study re-fetching its own copy
 * of user_study_settings -- one less round trip standing between the page mounting and the
 * first card rendering. */
export function StudyOnboardingProvider({
  user,
  settings,
  children,
}: {
  user: User;
  settings: StudySettings;
  children: ReactNode;
}) {
  // user/settings are themselves stable across re-renders that don't actually change them
  // (AuthContext's state and useStudySettings's data are both plain useState) -- memoize so
  // consumers (e.g. the 45s queue refresh interval) don't get torn down and rebuilt on every
  // unrelated re-render of StudyLayout.
  const value = useMemo(() => ({ user, settings }), [user, settings]);
  return <StudyOnboardingContext.Provider value={value}>{children}</StudyOnboardingContext.Provider>;
}

export function useStudyOnboarding() {
  const ctx = useContext(StudyOnboardingContext);
  if (!ctx) throw new Error("useStudyOnboarding must be used within StudyOnboardingProvider");
  return ctx;
}
