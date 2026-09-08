/** One row of public.user_achievements -- a permanent, one-time unlock (see that table's doc
 * comment). earned_at is never updated once set; acknowledged_at starts null and is set exactly
 * once, by acknowledge_achievements, when the unlock-celebration modal has been shown for it (see
 * supabase/migrations/20261017_acknowledge_achievements.sql). */
export interface UserAchievement {
  id: number;
  achievement_key: string;
  earned_at: string;
  acknowledged_at: string | null;
}
