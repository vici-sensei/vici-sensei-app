"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/auth-js";
import { createClient } from "@/lib/supabase/client";
import { fetchStudySettings } from "@/lib/data/studySettings";
import { JLPT_LEVELS } from "@/lib/srs/constants";
import { ApiError } from "@/lib/api/client";
import { clearCache, readCache, writeCache } from "@/lib/client-data/localCache";
import type { JlptLevel } from "@/lib/srs/constants";
import type { LeaderboardAlias, StudySettings, StudySettingsPatch } from "@/lib/types";

type Status = "loading" | "loaded" | "error";

function studySettingsCacheKey(userId: string): string {
  return `cache:study-settings:${userId}`;
}

/** `user` is passed in (not read from useAuth internally) so this hook stays usable before the auth gate has fully resolved — callers pass `null` until they have a confirmed user. */
export function useStudySettings(user: User | null) {
  const [status, setStatus] = useState<Status>("loading");
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
      setError(err instanceof Error ? err.message : "Failed to load study settings.");
      setStatus("error");
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    // Hydrate synchronously from cache the moment we have a user -- see useUserProfile for why.
    const cached = readCache<StudySettings>(studySettingsCacheKey(user.id));
    if (cached) {
      setData(cached);
      setStatus("loaded");
    }
    void refetch();
  }, [user, refetch]);

  return { data, status, error, refetch };
}

export async function updateStudySettings(userId: string, patch: StudySettingsPatch): Promise<StudySettings> {
  if (Object.keys(patch).length === 0) {
    throw new ApiError(400, "At least one field must be provided.");
  }
  if (patch.enabled_levels && (patch.enabled_levels.length === 0 || patch.enabled_levels.some((l) => !JLPT_LEVELS.includes(l)))) {
    throw new ApiError(400, "enabled_levels must contain at least one valid JLPT level.");
  }

  const supabase = createClient();

  if (patch.study_kanji === false || patch.study_vocabulary === false) {
    const { data: current, error: currentError } = await supabase
      .from("user_study_settings")
      .select("study_kanji, study_vocabulary")
      .eq("user_id", userId)
      .maybeSingle();
    if (currentError) throw new ApiError(500, currentError.message);

    const nextStudyKanji = patch.study_kanji ?? current?.study_kanji ?? true;
    const nextStudyVocabulary = patch.study_vocabulary ?? current?.study_vocabulary ?? true;
    if (!nextStudyKanji && !nextStudyVocabulary) {
      throw new ApiError(400, "At least one of study_kanji or study_vocabulary must remain true.");
    }
  }

  const { data, error } = await supabase
    .from("user_study_settings")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("user_id", userId)
    .select("*, leaderboard_alias:leaderboard_aliases(adjective, noun)")
    .single();

  if (error) throw new ApiError(500, error.message);
  return data;
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
      updated_at: new Date().toISOString(),
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
