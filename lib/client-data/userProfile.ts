"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/auth-js";
import { createClient } from "@/lib/supabase/client";
import { fetchUserProfile } from "@/lib/data/userProfile";
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
  "image/gif": "gif",
};

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
  }, [user, refetch]);

  return { data, status, error, refetch };
}

export async function updateDisplayName(userId: string, displayName: string): Promise<UserProfile> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("users")
    .update({ display_name: displayName })
    .eq("id", userId)
    .select(
      "email, display_name, avatar_url, country, show_country_on_leaderboard, is_premium, stripe_customer_id, created_at"
    )
    .single();

  if (error) throw new ApiError(500, error.message);
  writeCache(profileCacheKey(userId), data);
  return data;
}

export async function updateCountry(userId: string, country: string): Promise<UserProfile> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("users")
    .update({ country })
    .eq("id", userId)
    .select(
      "email, display_name, avatar_url, country, show_country_on_leaderboard, is_premium, stripe_customer_id, created_at"
    )
    .single();

  if (error) throw new ApiError(500, error.message);
  writeCache(profileCacheKey(userId), data);
  return data;
}

export async function updateShowCountryOnLeaderboard(userId: string, show: boolean): Promise<UserProfile> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("users")
    .update({ show_country_on_leaderboard: show })
    .eq("id", userId)
    .select(
      "email, display_name, avatar_url, country, show_country_on_leaderboard, is_premium, stripe_customer_id, created_at"
    )
    .single();

  if (error) throw new ApiError(500, error.message);
  writeCache(profileCacheKey(userId), data);
  return data;
}

export async function uploadAvatar(userId: string, file: Blob): Promise<UserProfile> {
  const ext = AVATAR_EXT_BY_MIME[file.type];
  if (!ext) throw new ApiError(400, "Unsupported image type. Use PNG, JPEG, WEBP or GIF.");
  if (file.size > MAX_AVATAR_UPLOAD_BYTES) throw new ApiError(400, "Image is too large. Maximum size is 5MB.");

  const supabase = createClient();

  const { data: existing } = await supabase.storage.from("avatars").list(userId);
  if (existing && existing.length > 0) {
    await supabase.storage.from("avatars").remove(existing.map((f) => `${userId}/${f.name}`));
  }

  const path = `${userId}/avatar.${ext}`;
  const { error: uploadError } = await supabase.storage
    .from("avatars")
    .upload(path, file, { contentType: file.type, upsert: true });
  if (uploadError) throw new ApiError(500, uploadError.message);

  const {
    data: { publicUrl },
  } = supabase.storage.from("avatars").getPublicUrl(path);
  const avatarUrl = `${publicUrl}?v=${Date.now()}`;

  const { data, error } = await supabase
    .from("users")
    .update({ avatar_url: avatarUrl })
    .eq("id", userId)
    .select(
      "email, display_name, avatar_url, country, show_country_on_leaderboard, is_premium, stripe_customer_id, created_at"
    )
    .single();

  if (error) throw new ApiError(500, error.message);
  writeCache(profileCacheKey(userId), data);
  return data;
}

export async function removeAvatar(userId: string): Promise<UserProfile> {
  const supabase = createClient();

  const { data: existing } = await supabase.storage.from("avatars").list(userId);
  if (existing && existing.length > 0) {
    await supabase.storage.from("avatars").remove(existing.map((f) => `${userId}/${f.name}`));
  }

  const { data, error } = await supabase
    .from("users")
    .update({ avatar_url: null })
    .eq("id", userId)
    .select(
      "email, display_name, avatar_url, country, show_country_on_leaderboard, is_premium, stripe_customer_id, created_at"
    )
    .single();

  if (error) throw new ApiError(500, error.message);
  writeCache(profileCacheKey(userId), data);
  return data;
}
