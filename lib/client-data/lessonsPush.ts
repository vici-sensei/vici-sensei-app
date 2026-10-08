"use client";

import type { User } from "@supabase/auth-js";
import { lessonsRequest } from "@/lib/client-data/lessons";
import { useRemoteData } from "@/lib/client-data/useRemoteData";
import type { DeviceSubscription } from "@/lib/lessons/push";

/** Web push for lesson notifications (worker/lib/lessonsPush.ts). */

/** The server's public key, or null while push is not set up on the server (the page then hides the switch). */
export function usePushConfig(user: User | null) {
  return useRemoteData({
    params: user ? { userId: user.id } : null,
    load: async () => (await lessonsRequest<{ publicKey: string | null }>("GET", "/api/lessons/push/config")).publicKey,
    errorFallback: "Couldn't load the push settings.",
  });
}

export const pushActions = {
  subscribe: (device: DeviceSubscription) => lessonsRequest<{ count: number }>("POST", "/api/lessons/push/subscribe", { ...device }),
  unsubscribe: (endpoint: string) => lessonsRequest<{ count: number }>("POST", "/api/lessons/push/unsubscribe", { endpoint }),
  /** Does the server know this device? */
  state: (endpoint: string) =>
    lessonsRequest<{ count: number; this_device: boolean }>("GET", `/api/lessons/push/state?endpoint=${encodeURIComponent(endpoint)}`),
};
