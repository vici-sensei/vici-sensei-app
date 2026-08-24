"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AsyncStatus, StudySettings } from "@/lib/types";

interface StudySettingsContextValue {
  data: StudySettings | null;
  status: AsyncStatus;
  error: string | null;
  refetch: () => Promise<void>;
}

const StudySettingsContext = createContext<StudySettingsContextValue | null>(null);

/** Shares the study settings already fetched once by the enclosing shell/settings layout (via
 *  useRequireOnboarded's own useStudySettings call) with every descendant that would otherwise
 *  fire its own independent fetch for the same row -- NavBar, browse tabs, the study settings
 *  page, etc. Mirrors UserProfileContext's pattern for the same reason. */
export function StudySettingsProvider({
  data,
  status,
  error,
  refetch,
  children,
}: StudySettingsContextValue & { children: ReactNode }) {
  return (
    <StudySettingsContext.Provider value={{ data, status, error, refetch }}>{children}</StudySettingsContext.Provider>
  );
}

export function useStudySettingsContext() {
  const ctx = useContext(StudySettingsContext);
  if (!ctx) throw new Error("useStudySettingsContext must be used within a StudySettingsProvider");
  return ctx;
}
