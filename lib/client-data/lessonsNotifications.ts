"use client";

import type { User } from "@supabase/auth-js";
import { lessonsRequest } from "@/lib/client-data/lessons";
import { useRemoteData } from "@/lib/client-data/useRemoteData";
import type { NotificationList, NotificationPref } from "@/lib/lessons/notifications";

/** The student's inbox and reminder switches (worker/lib/lessonsNotify.ts). */

const INBOX_SIZE = 50;

export function useLessonNotifications(user: User | null) {
  return useRemoteData({
    params: user ? { userId: user.id } : null,
    load: () => lessonsRequest<NotificationList>("GET", `/api/lessons/notifications?limit=${INBOX_SIZE}`),
    errorFallback: "Couldn't load your notifications.",
  });
}

export function useNotificationPrefs(user: User | null, enabled: boolean) {
  return useRemoteData({
    params: user && enabled ? { userId: user.id } : null,
    load: async () => (await lessonsRequest<{ prefs: NotificationPref[] }>("GET", "/api/lessons/notification-prefs")).prefs,
    errorFallback: "Couldn't load your reminder settings.",
  });
}

export const notificationActions = {
  /** Marks the given notifications read; without ids, all of them. */
  markRead: (ids?: number[]) => lessonsRequest<{ unread: number }>("POST", "/api/lessons/notifications/read", ids ? { ids } : {}),
  setPrefs: (prefs: NotificationPref[]) =>
    lessonsRequest<{ prefs: NotificationPref[] }>("POST", "/api/lessons/notification-prefs", { prefs }),
};
