import { createClient } from "@/lib/supabase/client";
import { ApiError } from "@/lib/api/client";
import { resetCard as resetCardData, suspendCard as suspendCardData } from "@/lib/data/cards";
import type { CardType } from "@/lib/srs/progressTables";
import type { ProgressStatus } from "@/lib/srs/constants";

async function requireUserId(): Promise<string> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new ApiError(401, "You are not logged in. Please log in.");
  return user.id;
}

export async function resetCard(type: CardType, id: number): Promise<void> {
  const supabase = createClient();
  const userId = await requireUserId();
  await resetCardData(supabase, userId, type, id);
}

export async function suspendCard(type: CardType, id: number): Promise<void> {
  const supabase = createClient();
  const userId = await requireUserId();
  await suspendCardData(supabase, userId, type, id);
}

/** Mirrors what resetCard/suspendCard set server-side (lib/data/cards.ts), so the UI can
 *  show the result immediately instead of waiting on the round trip. */
export function optimisticCardUpdate(action: "suspend" | "reset"): { status: ProgressStatus; due_at?: string } {
  return action === "suspend" ? { status: "suspended" } : { status: "new", due_at: new Date().toISOString() };
}
