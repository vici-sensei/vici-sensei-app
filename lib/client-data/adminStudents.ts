"use client";

import type { User } from "@supabase/auth-js";
import { createClient } from "@/lib/supabase/client";
import { fetchStudentRoster, setStudentPremium } from "@/lib/data/adminStudents";
import { ApiError, getErrorMessage } from "@/lib/api/client";
import { useRemoteData } from "@/lib/client-data/useRemoteData";

export function useStudentRoster(user: User | null) {
  return useRemoteData({
    params: user?.id ?? null,
    load: () => fetchStudentRoster(createClient()),
    errorFallback: "Failed to load students.",
  });
}

export async function updateStudentPremium(userId: string, isPremium: boolean, premiumUntil: string | null): Promise<void> {
  try {
    await setStudentPremium(createClient(), userId, isPremium, premiumUntil);
  } catch (err) {
    throw new ApiError(500, getErrorMessage(err, "Failed to update Pro access."));
  }
}
