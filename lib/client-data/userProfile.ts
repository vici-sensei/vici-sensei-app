"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/auth-js";
import { createClient } from "@/lib/supabase/client";
import { fetchUserProfile, PROFILE_COLUMNS } from "@/lib/data/userProfile";
import { ApiError, getErrorMessage } from "@/lib/api/client";
import { readCache, writeCache } from "@/lib/client-data/localCache";
import type { AsyncStatus, UserProfile } from "@/lib/types";

function profileCacheKey(userId: string): string {
  return `cache:profile:${userId}`;
}

const MAX_AVATAR_UPLOAD_BYTES = 5 * 1024 * 1024;
const AVATAR_EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
// Every upload gets a fresh file name (see uploadAvatar), so a URL's bytes never change and the
// browser/CDN can keep them for a year instead of re-checking on every leaderboard visit.
const AVATAR_CACHE_SECONDS = "31536000";

/** Deletes every file in the user's avatar folder except `keep`. Best effort on purpose: the
 *  caller has already pointed users.avatar_url where it should, so a failed delete only leaves
 *  unreferenced files, which the nightly `avatar-gc` job (avatar_gc.collect) sweeps up. */
async function removeOtherAvatarFiles(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  keep: string[]
): Promise<void> {
  try {
    const { data: existing } = await supabase.storage.from("avatars").list(userId);
    const stale = (existing ?? []).map((f) => `${userId}/${f.name}`).filter((path) => !keep.includes(path));
    if (stale.length > 0) await supabase.storage.from("avatars").remove(stale);
  } catch {
    // see above -- never fail an already-saved avatar change over cleanup
  }
}

export function useUserProfile(user: User | null) {
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [data, setData] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!user) return;
    // Only show the loading state for the first fetch — a background revalidation
    // (e.g. after saving a field) shouldn't unmount already-rendered content.
    setStatus((prev) => (prev === "loaded" ? prev : "loading"));
    try {
      const supabase = createClient();
      const profile = await fetchUserProfile(supabase, user.id);
      setData(profile);
      setStatus("loaded");
      writeCache(profileCacheKey(user.id), profile);
    } catch (err) {
      setError(getErrorMessage(err, "Failed to load user profile."));
      setStatus("error");
    }
  }, [user]);

  useEffect(() => {
    function sync() {
      if (!user) return;
      // Hydrate synchronously from cache the moment we have a user, so a repeat visit paints the
      // last-known profile immediately instead of sitting on FullScreenLoader -- refetch() below
      // then revalidates in the background without flipping status back to "loading".
      const cached = readCache<UserProfile>(profileCacheKey(user.id));
      if (cached) {
        setData(cached);
        setStatus("loaded");
      }
      void refetch();
    }
    sync();
  }, [user, refetch]);

  return { data, status, error, refetch };
}

type ProfilePatch = Partial<
  Pick<UserProfile, "display_name" | "avatar_url" | "country" | "show_country_on_leaderboard">
>;

/** Writes `patch` to the user's own `users` row and returns the saved profile, which also replaces
 * the cached copy so the next mount paints the new values straight away. */
async function updateProfile(userId: string, patch: ProfilePatch): Promise<UserProfile> {
  const supabase = createClient();
  const { data, error } = await supabase.from("users").update(patch).eq("id", userId).select(PROFILE_COLUMNS).single();
  if (error) throw new ApiError(500, error.message);
  writeCache(profileCacheKey(userId), data);
  return data;
}

export async function updateDisplayName(userId: string, displayName: string): Promise<UserProfile> {
  return updateProfile(userId, { display_name: displayName });
}

export async function updateCountry(userId: string, country: string): Promise<UserProfile> {
  return updateProfile(userId, { country });
}

export async function updateShowCountryOnLeaderboard(userId: string, show: boolean): Promise<UserProfile> {
  return updateProfile(userId, { show_country_on_leaderboard: show });
}

/** Stores `file` plus its small copy `thumb` (same MIME type) as
 *  "<userId>/avatar-<timestamp>.<ext>" and "..._sm.<ext>" -- lib/avatar.ts's avatarSrc() relies on
 *  that naming to find the thumbnail. Order matters for never leaving a broken or orphaned file:
 *  upload the new pair, point users.avatar_url at it, and only then delete the previous files. */
export async function uploadAvatar(userId: string, file: Blob, thumb: Blob): Promise<UserProfile> {
  const ext = AVATAR_EXT_BY_MIME[file.type];
  if (!ext || thumb.type !== file.type) throw new ApiError(400, "Unsupported image type. Use PNG, JPEG or WEBP.");
  if (file.size > MAX_AVATAR_UPLOAD_BYTES) throw new ApiError(400, "Image is too large. Maximum size is 5MB.");

  const supabase = createClient();
  const bucket = supabase.storage.from("avatars");

  const base = `${userId}/avatar-${Date.now()}`;
  const path = `${base}.${ext}`;
  const thumbPath = `${base}_sm.${ext}`;
  const options = { contentType: file.type, cacheControl: AVATAR_CACHE_SECONDS };
  const [main, small] = await Promise.all([bucket.upload(path, file, options), bucket.upload(thumbPath, thumb, options)]);
  const uploadError = main.error ?? small.error;
  if (uploadError) {
    await bucket.remove([path, thumbPath]);
    throw new ApiError(500, uploadError.message);
  }

  const {
    data: { publicUrl },
  } = bucket.getPublicUrl(path);

  let profile: UserProfile;
  try {
    profile = await updateProfile(userId, { avatar_url: publicUrl });
  } catch (err) {
    await bucket.remove([path, thumbPath]);
    throw err;
  }
  await removeOtherAvatarFiles(supabase, userId, [path, thumbPath]);
  return profile;
}

export async function removeAvatar(userId: string): Promise<UserProfile> {
  // Row first, files second: a failure in between leaves only unreferenced files (swept up
  // later), never a profile pointing at a photo that's already gone.
  const profile = await updateProfile(userId, { avatar_url: null });
  await removeOtherAvatarFiles(createClient(), userId, []);
  return profile;
}
