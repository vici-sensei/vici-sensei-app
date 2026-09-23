"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/auth-js";
import { createClient } from "@/lib/supabase/client";
import { fetchStudentRoster, setStudentPremium } from "@/lib/data/adminStudents";
import { ApiError, getErrorMessage } from "@/lib/api/client";
import type { AsyncStatus, StudentRosterRow } from "@/lib/types";

export function useStudentRoster(user: User | null) {
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [data, setData] = useState<StudentRosterRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!user) return;
    setStatus((prev) => (prev === "loaded" ? prev : "loading"));
    try {
      const rows = await fetchStudentRoster(createClient());
      setData(rows);
      setStatus("loaded");
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load students."));
      setStatus("error");
    }
  }, [user]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, status, error, refetch };
}

export async function updateStudentPremium(userId: string, isPremium: boolean, premiumUntil: string | null): Promise<void> {
  try {
    await setStudentPremium(createClient(), userId, isPremium, premiumUntil);
  } catch (err) {
    throw new ApiError(500, getErrorMessage(err, "Failed to update Pro access."));
  }
}
