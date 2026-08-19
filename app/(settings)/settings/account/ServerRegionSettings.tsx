"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useStudySettings, updateStudySettings } from "@/lib/client-data/studySettings";
import { ApiError } from "@/lib/api/client";
import { useToast } from "@/app/components/ui/Toast";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { SettingsHeader } from "@/app/components/ui/SettingsHeader";
import { RegionSelector } from "@/app/components/ui/RegionSelector";
import { guessServerRegion, type ServerRegion } from "@/lib/serverRegion";

export function ServerRegionSettings() {
  const { user } = useAuth();
  const { data: settings, status, refetch } = useStudySettings(user);
  const { showToast } = useToast();

  // Falls back to the timezone guess for accounts created before this setting existed
  // (preferred_server_region is null until they explicitly change it here).
  const [region, setRegion] = useState<ServerRegion>(() => settings?.preferred_server_region ?? guessServerRegion());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (settings?.preferred_server_region) setRegion(settings.preferred_server_region);
  }, [settings?.preferred_server_region]);

  async function handleChange(next: ServerRegion) {
    if (!user || next === region || saving) return;
    const previous = region;
    setRegion(next);
    setSaving(true);
    try {
      await updateStudySettings(user.id, { preferred_server_region: next });
      refetch();
    } catch (err) {
      setRegion(previous);
      showToast(err instanceof ApiError ? err.message : "Could not save your server region.", "error");
    } finally {
      setSaving(false);
    }
  }

  if (status === "loading" || !settings) {
    return (
      <div>
        <Skeleton className="mb-2 h-[1.7rem] w-44" />
        <Skeleton className="mb-6.5 h-4 w-80" />
        <div className="flex max-w-sm flex-col gap-3">
          <Skeleton className="h-[76px] w-full rounded-2xl" />
          <Skeleton className="h-[76px] w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <SettingsHeader
        title="Server region"
        description="Choose the continent closest to your physical location for the best speed."
      />
      <RegionSelector
        region={region}
        onChange={handleChange}
        disabled={saving}
        accent="blue"
        className="flex max-w-sm flex-col gap-3 text-left"
      />
    </div>
  );
}
