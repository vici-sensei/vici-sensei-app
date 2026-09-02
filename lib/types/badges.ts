/** One row of public.user_badges -- an achievement badge, upserted in place (see that table's
 * doc comment) rather than appended, so this is always the latest state of that achievement. */
export interface UserBadge {
  id: number;
  badge_key: string;
  test_type: string;
  attempt_number: number;
  percent: number;
  earned_at: string;
  updated_at: string;
}
