"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { updateStudySettings } from "@/lib/client-data/studySettings";
import { useStudySettingsContext } from "@/lib/client-data/StudySettingsContext";
import { ApiError } from "@/lib/api/client";
import { useToast } from "@/app/components/ui/Toast";
import { SettingsHeader } from "@/app/components/ui/SettingsHeader";
import { RegionSelector } from "@/app/components/ui/RegionSelector";
import { guessServerRegion, type ServerRegion } from "@/lib/serverRegion";

export function ServerRegionSettings() {
  const { user } = useAuth();
  const { data: settings, refetch } = useStudySettingsContext();
  const { showToast } = useToast();

  // Null until the real setting has loaded -- rendered as neither region selected,
  // rather than blocking the whole page behind a skeleton.
  const [region, setRegion] = useState<ServerRegion | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    // Falls back to the timezone guess for accounts created before this setting existed
    // (preferred_server_region is null until they explicitly change it here).
    if (settings) setRegion(settings.preferred_server_region ?? guessServerRegion());
  }, [settings]);

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

  return (
    <div>
      <SettingsHeader
        title="Server region"
        description="Choose the continent closest to your physical location for the best speed."
      />
      <RegionSelector
        region={region}
        onChange={handleChange}
        disabled={!settings || saving}
        accent="blue"
        className="flex max-w-sm flex-col gap-3 text-left"
      />
    </div>
  );
}
