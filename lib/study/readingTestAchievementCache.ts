const CELEBRATED_KEY_PREFIX = "vici_reading_test_achievement_celebrated";

// Same reasoning as levelUpCache.ts's hasCelebratedMaxLevel/markMaxLevelCelebrated: there's no
// server-side "already celebrated" record (award_achievement is a permanent, one-time unlock --
// see 20260924_kana_achievements.sql -- so re-deriving "was this just earned" from user_achievements
// alone can't distinguish a fresh unlock from a much later revisit), so it's tracked client-side
// instead, persistent (localStorage, not sessionStorage) since the point is never re-showing the
// achievement-earned modal for the same key again on this device.
//
// Scoped by achievement_key (not just userId) since a reading test summary page can newly earn up
// to two keys at once ('<test_type>_test' the first time every sentence is answered, regardless of
// score, and '<test_type>_test_100' the first time that pass is a perfect one) -- each needs its
// own independent "have I shown this one before" flag.
function celebratedKey(userId: string, achievementKey: string): string {
  return `${CELEBRATED_KEY_PREFIX}:${userId}:${achievementKey}`;
}

export function hasCelebratedReadingTestAchievement(userId: string, achievementKey: string): boolean {
  if (typeof window === "undefined") return true;
  return localStorage.getItem(celebratedKey(userId, achievementKey)) === "1";
}

export function markReadingTestAchievementCelebrated(userId: string, achievementKey: string) {
  if (typeof window !== "undefined") localStorage.setItem(celebratedKey(userId, achievementKey), "1");
}
