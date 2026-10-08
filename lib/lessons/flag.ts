/**
 * Lesson booking (docs/LESSON_BOOKING_PLAN.md) is built and deployed ahead of its launch: the page
 * and the Worker routes exist, but the "Lessons" link in the menu only appears when this flag is on.
 * Same pattern as `isPasswordAuthEnabled()` and `isMultiRegionEnabled()`. The page itself is not
 * hidden -- anyone who opens /lessons by URL gets it (a student without access just sees that
 * lessons aren't open for their account) -- so the owner can try it with real data before turning
 * the link on for everybody.
 *
 * Read at BUILD time, as a literal `process.env.NEXT_PUBLIC_*` so Next inlines it: it has to be set
 * in the deploy workflow's build step too (a GitHub secret named NEXT_PUBLIC_LESSONS with the value
 * `true`), not only in .env.local. A secret that does not exist expands to an empty string: off.
 */
export function isLessonsEnabled(): boolean {
  return process.env.NEXT_PUBLIC_LESSONS === "true";
}
