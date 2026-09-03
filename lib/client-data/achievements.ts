"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchUserAchievements } from "@/lib/data/achievements";
import { getErrorMessage } from "@/lib/api/client";
import type { AsyncStatus, UserAchievement } from "@/lib/types";

export function useUserAchievements(userId: string): {
  data: UserAchievement[] | null;
  status: AsyncStatus;
  error: string | null;
} {
  const [data, setData] = useState<UserAchievement[] | null>(null);
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchUserAchievements(createClient(), userId)
      .then((rows) => {
        if (cancelled) return;
        setData(rows);
        setStatus("loaded");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getErrorMessage(err, "Failed to load achievements."));
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { data, status, error };
}
