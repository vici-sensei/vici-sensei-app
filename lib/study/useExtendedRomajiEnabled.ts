"use client";

import { useStudyOnboarding } from "./StudyOnboardingContext";

/** The student's "Extended romaji" preference (user_study_settings.extended_romaji_enabled) -- when
 * true, typed romaji answers (kana reading cards, reading tests) also accept the extended_romaji
 * spellings of the row being tested. `?? false`: settings hydrated from a localStorage cache
 * written before that column existed have no such key -- same as the column's default. Only
 * usable under the (study) layout, which provides StudyOnboardingProvider. */
export function useExtendedRomajiEnabled(): boolean {
  return useStudyOnboarding().settings.extended_romaji_enabled ?? false;
}
