"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import type { User } from "@supabase/auth-js";
import { createClient } from "@/lib/supabase/client";
import { fetchStudySettings } from "@/lib/data/studySettings";
import { JLPT_LEVELS } from "@/lib/srs/constants";
import { ApiError, getErrorMessage } from "@/lib/api/client";
import { clearCache, readCache, writeCache } from "@/lib/client-data/localCache";
import type { JlptLevel } from "@/lib/srs/constants";
import type { AsyncStatus, LeaderboardAlias, StudySettings, StudySettingsPatch } from "@/lib/types";

/** Exported so other modules (onboarding's multi-tab sync) can recognize this same key in a
 * `storage` event without duplicating the format string. */
export function studySettingsCacheKey(userId: string): string {
  return `cache:study-settings:${userId}`;
}

/** Fired on every successful `updateStudySettings` so OTHER already-mounted `useStudySettings`
 * instances in the same tab pick up the change immediately -- e.g. switching study track in
 * Settings should update the shell NavBar's Explore link without a page reload. The native
 * `storage` event (used by onboarding's multi-tab sync, see the key comment above) only fires in
 * *other* tabs, never the one that made the change, so it can't cover this same-tab case. */
const STUDY_SETTINGS_UPDATED_EVENT = "study-settings-updated";

/** `useLayoutEffect` warns during SSR, so fall back to `useEffect` there -- the cache-hydration
 * effect below only ever does anything in the browser (see `isBrowser` in localCache.ts) anyway,
 * this only changes *when* the client-side hydration runs relative to paint. */
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

interface StudySettingsUpdatedDetail {
  userId: string;
  settings: StudySettings;
}

function announceStudySettingsUpdate(userId: string, settings: StudySettings) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<StudySettingsUpdatedDetail>(STUDY_SETTINGS_UPDATED_EVENT, { detail: { userId, settings } })
  );
}

/** `user` is passed in (not read from useAuth internally) so this hook stays usable before the auth gate has fully resolved — callers pass `null` until they have a confirmed user. */
export function useStudySettings(user: User | null) {
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [data, setData] = useState<StudySettings | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!user) return;
    // Only show the loading state for the first fetch — a background revalidation
    // (e.g. after autosaving a field) shouldn't unmount already-rendered content.
    setStatus((prev) => (prev === "loaded" ? prev : "loading"));
    try {
      const supabase = createClient();
      const settings = await fetchStudySettings(supabase, user.id);
      setData(settings);
      setStatus("loaded");
      writeCache(studySettingsCacheKey(user.id), settings);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load study settings."));
      setStatus("error");
    }
  }, [user]);

  useIsomorphicLayoutEffect(() => {
    if (!user) return;
    // Hydrate synchronously from cache the moment we have a user -- see useUserProfile for why.
    // useLayoutEffect (not useEffect) so this lands before the browser paints, avoiding a
    // flash of the wrong content (e.g. BrowseTabs briefly showing all 4 tabs before settling
    // on the cached study_track's set) on every mount.
    const cached = readCache<StudySettings>(studySettingsCacheKey(user.id));
    if (cached) {
      setData(cached);
      setStatus("loaded");
    }
    void refetch();
  }, [user, refetch]);

  useEffect(() => {
    if (!user) return;
    function onUpdate(e: Event) {
      const { userId, settings } = (e as CustomEvent<StudySettingsUpdatedDetail>).detail;
      if (userId !== user!.id) return;
      setData(settings);
      setStatus("loaded");
    }
    window.addEventListener(STUDY_SETTINGS_UPDATED_EVENT, onUpdate);
    return () => window.removeEventListener(STUDY_SETTINGS_UPDATED_EVENT, onUpdate);
  }, [user]);

  return { data, status, error, refetch };
}

/** Re-fetches this user's settings row and pushes it out to every other mounted
 * useStudySettings instance in this tab via the same event updateStudySettings uses -- for
 * mutations that change user_study_settings server-side without going through updateStudySettings
 * itself (currently just check_and_advance_jlpt_level's auto-advance, called from useStudyQueue's
 * rate()). Without this, /study's own `settings` (fed by StudyLayout's useRequireOnboarded) would
 * keep querying the just-completed level's new-card candidates against the pre-advance
 * enabled_levels until the next full page load. */
export async function refreshStudySettings(userId: string): Promise<StudySettings> {
  const supabase = createClient();
  const settings = await fetchStudySettings(supabase, userId);
  if (!settings) throw new ApiError(404, "Study settings not found.");
  writeCache(studySettingsCacheKey(userId), settings);
  announceStudySettingsUpdate(userId, settings);
  return settings;
}

export async function updateStudySettings(userId: string, patch: StudySettingsPatch): Promise<StudySettings> {
  if (Object.keys(patch).length === 0) {
    throw new ApiError(400, "At least one field must be provided.");
  }
  if (patch.enabled_levels && (patch.enabled_levels.length === 0 || patch.enabled_levels.some((l) => !JLPT_LEVELS.includes(l)))) {
    throw new ApiError(400, "enabled_levels must contain at least one valid JLPT level.");
  }

  const supabase = createClient();

  if (
    patch.study_kanji === false ||
    patch.study_vocabulary === false ||
    patch.study_hiragana === false ||
    patch.study_katakana === false
  ) {
    const { data: current, error: currentError } = await supabase
      .from("user_study_settings")
      .select("study_track, study_kanji, study_vocabulary, study_hiragana, study_katakana")
      .eq("user_id", userId)
      .maybeSingle();
    if (currentError) throw new ApiError(500, currentError.message);

    // The "at least one" rule only applies within whichever track this patch leaves the row
    // on -- switching track is exactly what legitimately sets the *other* pair to both-false
    // (the separation CHECK requires it), so that pair must be skipped, not validated, once
    // the patch is actually a track switch.
    const nextStudyTrack = patch.study_track ?? current?.study_track ?? "standard";

    if (nextStudyTrack === "standard") {
      const nextStudyKanji = patch.study_kanji ?? current?.study_kanji ?? true;
      const nextStudyVocabulary = patch.study_vocabulary ?? current?.study_vocabulary ?? true;
      if (!nextStudyKanji && !nextStudyVocabulary) {
        throw new ApiError(400, "At least one of study_kanji or study_vocabulary must remain true.");
      }
    } else {
      const nextStudyHiragana = patch.study_hiragana ?? current?.study_hiragana ?? true;
      const nextStudyKatakana = patch.study_katakana ?? current?.study_katakana ?? true;
      if (!nextStudyHiragana && !nextStudyKatakana) {
        throw new ApiError(400, "At least one of study_hiragana or study_katakana must remain true.");
      }
    }
  }

  const { data, error } = await supabase
    .from("user_study_settings")
    .update({ ...patch })
    .eq("user_id", userId)
    .select("*, leaderboard_alias:leaderboard_aliases(adjective, noun)")
    .single();

  if (error) throw new ApiError(500, error.message);
  // Without this, a refresh right after a patch (e.g. onboarding advancing a step) reads the
  // stale pre-patch snapshot from cache before the next background refetch overwrites it -- and
  // useStudySettings's seed-once effects (onboarding's progress resume, among others) only ever
  // look at the first "loaded" value they see, so they'd get stuck on that stale one permanently.
  //
  // Guarded against one specific regression: an earlier request that was still in flight when
  // completeOnboarding() ran can land after it and, since it never touched onboarding_completed,
  // carry a stale "false" for that column from before completion happened -- overwriting the
  // cache with that would bounce a just-finished user straight back to /onboarding. Once the
  // cache has ever seen onboarding_completed: true, it's a one-way door -- nothing should be able
  // to un-complete it, so any write on top of that state is trusted only if it agrees.
  const cached = readCache<StudySettings>(studySettingsCacheKey(userId));
  if (!cached?.onboarding_completed || data.onboarding_completed) {
    writeCache(studySettingsCacheKey(userId), data);
  }
  announceStudySettingsUpdate(userId, data);
  return data;
}

/** Whether every hiragana character is already mastered (status review/relearning) --
 * mirrors the exact condition the DB's enforce_katakana_requires_hiragana_trigger checks
 * (20260825_enforce_katakana_requires_hiragana.sql), so the "Study katakana" toggle in
 * Settings can be disabled client-side instead of only failing server-side on submit.
 * get_level_progress's hiragana_reading row ignores its p_level argument (kana has no JLPT
 * level), so "N5" here is just a placeholder to satisfy the RPC's signature. */
export async function fetchHiraganaMastered(userId: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_level_progress", { p_user_id: userId, p_level: "N5" });
  if (error) throw new ApiError(500, error.message);
  const row = (data as { category: string; learned: number; total: number }[] | null)?.find(
    (r) => r.category === "hiragana_reading"
  );
  return row != null && row.total > 0 && row.learned >= row.total;
}

/** Same as fetchHiraganaMastered, but for katakana -- mirrors the condition
 * katakana_auto_activate_standard checks (20260920_reading_test_gates_standard.sql). */
export async function fetchKatakanaMastered(userId: string): Promise<boolean> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_level_progress", { p_user_id: userId, p_level: "N5" });
  if (error) throw new ApiError(500, error.message);
  const row = (data as { category: string; learned: number; total: number }[] | null)?.find(
    (r) => r.category === "katakana_reading"
  );
  return row != null && row.total > 0 && row.learned >= row.total;
}

export interface NewCardCaps {
  kanjiMax: number;
  vocabMax: number;
  hiraganaMax: number;
  katakanaMax: number;
}

/** How high each "New X per day" stepper can go right now -- get_new_card_caps
 * (20260902_harden_new_card_introduction.sql) derives all four straight from how much content
 * currently exists in kanji/vocabulary/hiragana/katakana, the same numbers
 * clamp_new_card_caps_trigger enforces server-side on save. Fetched so StudySettingsForm can
 * disable each "+" before the user ever hits that server-side clamp, instead of only finding out
 * after an autosave silently reduces the value. */
export async function fetchNewCardCaps(): Promise<NewCardCaps> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_new_card_caps").single();
  if (error) throw new ApiError(500, error.message);
  const row = data as { kanji_max: number; vocab_max: number; hiragana_max: number; katakana_max: number };
  return { kanjiMax: row.kanji_max, vocabMax: row.vocab_max, hiraganaMax: row.hiragana_max, katakanaMax: row.katakana_max };
}

/** Assigns a new random leaderboard alias to the current user (the settings page's dice button). */
export async function rerollLeaderboardAlias(): Promise<LeaderboardAlias> {
  const supabase = createClient();
  const { data, error } = await supabase.rpc("reroll_leaderboard_alias").single();

  if (error) throw new ApiError(500, error.message);
  return data as LeaderboardAlias;
}

export async function completeOnboarding(
  userId: string,
  enabledLevels: JlptLevel[],
  leaderboardAnonymous: boolean
): Promise<void> {
  if (enabledLevels.length === 0) {
    throw new ApiError(400, "enabled_levels must contain at least one valid JLPT level.");
  }

  const supabase = createClient();
  const { error } = await supabase
    .from("user_study_settings")
    .update({
      enabled_levels: enabledLevels,
      leaderboard_anonymous: leaderboardAnonymous,
      onboarding_completed: true,
    })
    .eq("user_id", userId)
    .select("user_id")
    .single();

  if (error) throw new ApiError(500, error.message);

  // This only selects `user_id` above, so there's no fresh row to cache -- and leaving the
  // stale pre-onboarding cache (onboarding_completed: false) in place would make the shell's
  // next mount trust it instantly and bounce straight back to /onboarding before the real
  // refetch lands. Clearing it forces that mount to actually wait for the network.
  clearCache(studySettingsCacheKey(userId));
}
