import type { IconType } from "react-icons";
import { FaBookOpen, FaMedal } from "react-icons/fa6";
import type { UserBadge } from "@/lib/types";

export interface BadgeDisplay {
  icon: IconType;
  title: string;
  description: string;
  /** Gold tone once the underlying achievement is fully done (100%); blue while still in progress. */
  complete: boolean;
}

const READING_TEST_LABELS: Record<string, string> = {
  hiragana: "Hiragana",
  katakana: "Katakana",
};

export interface BadgeCatalogEntry {
  badgeKey: string;
  icon: IconType;
  title: string;
  /** Shown while the badge is still locked, in place of the earned-attempt description. */
  lockedDescription: string;
}

/** Every badge that exists, earned or not -- lets the UI show the full trophy case (locked
 * entries greyed out) instead of only what a user has already unlocked. Keep in sync with
 * READING_TEST_LABELS above; extend here whenever a new badge_key is introduced. */
export const BADGE_CATALOG: BadgeCatalogEntry[] = Object.entries(READING_TEST_LABELS).map(([testType, label]) => ({
  badgeKey: `reading_test_${testType}`,
  icon: FaBookOpen,
  title: `${label} Reading Test`,
  lockedDescription: `Complete the ${label} reading test to earn this badge.`,
}));

/** Resolves a user_badges row (id/numbers only) into what the UI actually shows -- kept out of
 * the database so copy/icon changes don't need a migration. Falls back to a generic look for any
 * badge_key this registry doesn't recognize yet, so an older client never crashes on a newer
 * badge kind. */
export function describeBadge(badge: UserBadge): BadgeDisplay {
  if (badge.badge_key.startsWith("reading_test_")) {
    const label = READING_TEST_LABELS[badge.test_type] ?? badge.test_type;
    return {
      icon: FaBookOpen,
      title: `${label} Reading Test`,
      description: `Attempt #${badge.attempt_number} — ${badge.percent}% correct`,
      complete: badge.percent >= 100,
    };
  }
  return {
    icon: FaMedal,
    title: badge.badge_key,
    description: `Attempt #${badge.attempt_number} — ${badge.percent}% correct`,
    complete: badge.percent >= 100,
  };
}
