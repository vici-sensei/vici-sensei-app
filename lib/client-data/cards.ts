import { createClient } from "@/lib/supabase/client";
import {
  resetCard as resetCardData,
  suspendCard as suspendCardData,
  reactivateCard as reactivateCardData,
} from "@/lib/data/cards";
import type { CardType } from "@/lib/srs/progressTables";
import { requireUserId } from "@/lib/client-data/requireUserId";

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
