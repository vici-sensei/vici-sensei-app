"use client";

import { useEffect, useState } from "react";
import { FaCheck, FaEarthAmericas, FaEarthEurope } from "react-icons/fa6";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useStudySettings, updateStudySettings } from "@/lib/client-data/studySettings";
import { ApiError } from "@/lib/api/client";
import { useToast } from "@/app/components/ui/Toast";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { guessServerRegion, type ServerRegion } from "@/lib/serverRegion";

const REGION_META: Record<ServerRegion, { icon: typeof FaEarthAmericas; description: string }> = {
  America: { icon: FaEarthAmericas, description: "North & South America" },
  Europe: { icon: FaEarthEurope, description: "Europe, Africa & Western Asia" },
};

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
      <h2 className="mb-2 text-[1.7rem] font-extrabold leading-[1.2] tracking-[-0.8px]">Server region</h2>
      <p className="mb-6.5 text-base leading-[1.6] text-text-muted">
        Choose the continent closest to your physical location for the best speed.
      </p>
      <div className="flex max-w-sm flex-col gap-3 text-left">
        {(Object.keys(REGION_META) as ServerRegion[]).map((option) => {
          const { icon: Icon, description } = REGION_META[option];
          const selected = option === region;
          return (
            <button
              key={option}
              type="button"
              onClick={() => handleChange(option)}
              disabled={saving}
              className={`relative flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-70 ${
                selected
                  ? "border-accent-blue bg-accent-blue/[0.08] shadow-[0_0_20px_rgba(0,210,255,0.35)]"
                  : "border-border-soft bg-white/[0.03] hover:border-white/20"
              }`}
            >
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl ${
                  selected ? "bg-accent-blue text-black" : "bg-white/[0.06] text-text-muted"
                }`}
              >
                <Icon />
              </div>
              <div className="min-w-0 flex-1">
                <span className="text-[1.05rem] font-extrabold text-white">{option}</span>
                <p className="mt-0.5 text-[0.8rem] text-text-muted">{description}</p>
              </div>
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                  selected ? "border-accent-blue bg-accent-blue text-black" : "border-white/20 text-transparent"
                }`}
              >
                <FaCheck className="h-3 w-3" />
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
