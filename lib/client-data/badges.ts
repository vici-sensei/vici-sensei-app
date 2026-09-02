"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchUserBadges } from "@/lib/data/badges";
import { getErrorMessage } from "@/lib/api/client";
import type { AsyncStatus, UserBadge } from "@/lib/types";

export function useUserBadges(userId: string): {
  data: UserBadge[] | null;
  status: AsyncStatus;
  error: string | null;
} {
  const [data, setData] = useState<UserBadge[] | null>(null);
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchUserBadges(createClient(), userId)
      .then((rows) => {
        if (cancelled) return;
        setData(rows);
        setStatus("loaded");
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getErrorMessage(err, "Failed to load badges."));
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [userId]);

  return { data, status, error };
}
