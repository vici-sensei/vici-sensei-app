/** One row of public.user_achievements -- a permanent, one-time unlock (see that table's doc
 * comment). Never updated once earned, unlike public.test_status which tracks live progress. */
export interface UserAchievement {
  id: number;
  achievement_key: string;
  earned_at: string;
}
