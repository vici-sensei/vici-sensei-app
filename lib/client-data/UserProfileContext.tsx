"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { UserProfile } from "@/lib/types";

interface UserProfileContextValue {
  profile: UserProfile;
  refetch: () => Promise<void>;
}

const UserProfileContext = createContext<UserProfileContextValue | null>(null);

/** Shares the profile fetched by (settings)/layout.tsx with its pages, so a change made on
 *  a page (e.g. uploading or removing an avatar) is reflected in the layout's header
 *  immediately instead of only after the next full fetch. */
export function UserProfileProvider({
  profile,
  refetch,
  children,
}: UserProfileContextValue & { children: ReactNode }) {
  return <UserProfileContext.Provider value={{ profile, refetch }}>{children}</UserProfileContext.Provider>;
}

export function useUserProfileContext() {
  const ctx = useContext(UserProfileContext);
  if (!ctx) throw new Error("useUserProfileContext must be used within a UserProfileProvider");
  return ctx;
}
