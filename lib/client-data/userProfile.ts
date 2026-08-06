"use client";

import { useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { fetchUserProfile } from "@/lib/data/userProfile";
import { ApiError } from "@/lib/api/client";
import type { UserProfile } from "@/lib/types";

const MAX_AVATAR_UPLOAD_BYTES = 5 * 1024 * 1024;
const AVATAR_EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};

type Status = "loading" | "loaded" | "error";

export function useUserProfile(user: User | null) {
  const [status, setStatus] = useState<Status>("loading");
  const [data, setData] = useState<UserProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!user) return;
    setStatus("loading");
    try {
      const supabase = createClient();
      const profile = await fetchUserProfile(supabase, user.id);
      setData(profile);
      setStatus("loaded");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load user profile.");
      setStatus("error");
    }
  }, [user]);

  useEffect(() => {
    if (!user) return;
    void refetch();
  }, [user, refetch]);

  return { data, status, error, refetch };
}

export async function updateDisplayName(userId: string, displayName: string): Promise<UserProfile> {
  const supabase = createClient();
  const { data, error } = await supabase
    .from("users")
    .update({ display_name: displayName, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select("email, display_name, avatar_url, is_premium, created_at")
    .single();

  if (error) throw new ApiError(500, error.message);
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
    .update({ avatar_url: avatarUrl, updated_at: new Date().toISOString() })
    .eq("id", userId)
    .select("email, display_name, avatar_url, is_premium, created_at")
    .single();

  if (error) throw new ApiError(500, error.message);
  return data;
}
