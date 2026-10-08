"use client";

import type { User } from "@supabase/auth-js";
import { lessonsRequest } from "@/lib/client-data/lessons";
import { useRemoteData } from "@/lib/client-data/useRemoteData";

/** Lessons in Google Calendar (worker/lib/googleCalendar.ts). `configured: false` while the server has no
 * Google key: the page then shows nothing. */
export type GoogleCalendarState =
  | { configured: false }
  | {
      configured: true;
      enabled: boolean;
      calendar_id: string | null;
      calendar_link: string | null;
      shared_with: string | null;
      synced_at: string | null;
      last_error: string | null;
      events: number;
    };

export function useGoogleCalendar(user: User | null) {
  return useRemoteData({
    params: user ? { userId: user.id } : null,
    load: () => lessonsRequest<GoogleCalendarState>("GET", "/api/lessons/google"),
    errorFallback: "Couldn't load your Google Calendar settings.",
  });
}

export const googleActions = {
  enable: () => lessonsRequest<GoogleCalendarState>("POST", "/api/lessons/google/enable", {}),
  disable: () => lessonsRequest<GoogleCalendarState>("POST", "/api/lessons/google/disable", {}),
};
