"use client";

import { useKanaExtendedRomaji } from "@/lib/client-data/kana";
import type { ExtendedUnits } from "./alternateAnswers";
import { useExtendedRomajiEnabled } from "./useExtendedRomajiEnabled";

/** The kana tables' spellings matchesExtendedRomaji needs, or null while "Extended romaji" is off
 * (or the tables haven't loaded yet). The meaning cards only use them to recognise a typed reading
 * as an alternate, so unlike the Word reading card they never hold Check back waiting for them --
 * until they arrive, a reading is recognised in kana or standard Hepburn only. */
export function useExtendedRomajiUnits(): ExtendedUnits {
  const enabled = useExtendedRomajiEnabled();
  const { data } = useKanaExtendedRomaji(enabled);
  return enabled && data ? data.units : null;
}
