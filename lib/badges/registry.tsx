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
