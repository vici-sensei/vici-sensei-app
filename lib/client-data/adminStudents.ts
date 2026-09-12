"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/auth-js";
import { createClient } from "@/lib/supabase/client";
import { fetchStudentRoster } from "@/lib/data/adminStudents";
import { getErrorMessage } from "@/lib/api/client";
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
