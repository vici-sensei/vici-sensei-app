import { createClient } from "@/lib/supabase/client";
import { ApiError } from "@/lib/api/client";
import {
  resetCard as resetCardData,
  suspendCard as suspendCardData,
  reactivateCard as reactivateCardData,
} from "@/lib/data/cards";
import type { CardType } from "@/lib/srs/progressTables";

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

export async function reactivateCard(type: CardType, id: number): Promise<void> {
  const supabase = createClient();
  const userId = await requireUserId();
  await reactivateCardData(supabase, userId, type, id);
}
