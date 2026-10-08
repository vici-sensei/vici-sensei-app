"use client";

import type { User } from "@supabase/auth-js";
import { lessonsRequest } from "@/lib/client-data/lessons";
import { useRemoteData } from "@/lib/client-data/useRemoteData";
import type { WaitlistEntry } from "@/lib/lessons/waitlist";

/** The student's waitlist (worker/lib/lessonsWaitlist.ts). */

export function useWaitlist(user: User | null) {
  return useRemoteData({
    params: user ? { userId: user.id } : null,
    load: async () => (await lessonsRequest<{ entries: WaitlistEntry[] }>("GET", "/api/lessons/waitlist")).entries,
    errorFallback: "Couldn't load your waitlist.",
  });
}

export interface WaitlistJoin {
  classId: string;
  kind: "fixed" | "once";
  /** Template NY date of the lesson (kind "once"). */
  nyDate?: string;
  /** The weekly class to give up if a seat opens and the weekly limit needs it (kind "fixed"). */
  replaceClassId?: string | null;
  /** The lesson to give up instead (kind "once"). */
  swap?: { classId: string; nyDate: string } | null;
}

export const waitlistActions = {
  join: (j: WaitlistJoin) =>
    lessonsRequest<{ id: number }>("POST", "/api/lessons/waitlist/join", {
      classId: j.classId,
      kind: j.kind,
      nyDate: j.kind === "once" ? j.nyDate : undefined,
      replaceClassId: j.kind === "fixed" ? (j.replaceClassId ?? null) : undefined,
      swapClassId: j.kind === "once" ? (j.swap?.classId ?? null) : undefined,
      swapDate: j.kind === "once" ? (j.swap?.nyDate ?? null) : undefined,
    }),
  leave: (id: number) => lessonsRequest("POST", "/api/lessons/waitlist/leave", { id }),
  /** The first to confirm gets the seat. `replaceClassId` / `swap` override what the entry says when the weekly limit needs a choice. */
  confirm: (id: number, opts: { replaceClassId?: string | null; swap?: { classId: string; nyDate: string } | null } = {}) =>
    lessonsRequest("POST", "/api/lessons/waitlist/confirm", {
      id,
      replaceClassId: opts.replaceClassId ?? null,
      swapClassId: opts.swap?.classId ?? null,
      swapDate: opts.swap?.nyDate ?? null,
    }),
};
