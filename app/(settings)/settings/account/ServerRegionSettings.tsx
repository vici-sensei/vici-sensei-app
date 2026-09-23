"use client";

import { useEffect, useState } from "react";
import { FaCheck, FaEarthAmericas, FaEarthEurope } from "react-icons/fa6";
import { useAuth } from "@/lib/auth/AuthProvider";
import { updateStudySettings } from "@/lib/client-data/studySettings";
import { useStudySettingsContext } from "@/lib/client-data/StudySettingsContext";
import { getRegionMoveStatus, moveToOtherRegion, type RegionMoveProgress } from "@/lib/client-data/account";
import { ApiError, getErrorMessage } from "@/lib/api/client";
import { useToast } from "@/app/components/ui/Toast";
import { SettingsHeader } from "@/app/components/ui/SettingsHeader";
import { RegionSelector } from "@/app/components/ui/RegionSelector";
import { guessServerRegion, type ServerRegion } from "@/lib/serverRegion";
import { getActiveRegion, isMultiRegionEnabled, type Region } from "@/lib/supabase/regions";

const REGION_META: Record<Region, { label: string; description: string; icon: typeof FaEarthEurope }> = {
  eu: { label: "Europe", description: "Europe, Africa & Western Asia", icon: FaEarthEurope },
  us: { label: "Americas", description: "North & South America", icon: FaEarthAmericas },
};

/** A ring that fills clockwise as `percent` climbs, replacing the plain checkmark on whichever
 * card is currently being moved TO -- the only progress indicator this flow shows (no overlay, no
 * modal, per the redesign). */
function ProgressRing({ percent }: { percent: number }) {
  const size = 40;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference * (1 - percent / 100);
  return (
    <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
      <svg width={size} height={size} className="-rotate-90 text-accent-blue">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 300ms ease" }}
        />
      </svg>
      <span className="absolute text-[0.6rem] font-bold text-white">{percent}%</span>
    </div>
  );
}

/** Behind NEXT_PUBLIC_MULTI_REGION, the region a signed-in user is in is a real, settled fact
 * (decided at login -- see app/login/page.tsx -- and enforced by the "Before User Created" hook).
 * Clicking the other region's card starts a self-service move immediately -- no confirmation step,
 * matching this project's other account actions being one click (see AccountDangerZone for the
 * one exception, which needs its heavier confirmation for a different reason). Progress shows only
 * as the target card's own fill ring; there's no separate overlay. `moveToOtherRegion()`
 * (lib/client-data/account.ts -> the Worker's /api/region-move/* -- see worker/lib/regionMove.ts)
 * does the actual work and is safe to resume, which is what happens automatically on mount if a
 * previous attempt was left mid-flight (tab closed, etc). */
function ActiveRegionDisplay() {
  const { showToast } = useToast();
  const region = getActiveRegion();

  const [movingTo, setMovingTo] = useState<Region | null>(null);
  const [percent, setPercent] = useState(0);

  async function runMove(targetRegion: Region) {
    setMovingTo(targetRegion);
    setPercent(0);
    try {
      await moveToOtherRegion(region, targetRegion, (p: RegionMoveProgress) => setPercent(p.percent));
      window.location.href = "/settings/account";
    } catch (err) {
      setMovingTo(null);
      showToast(
        err instanceof ApiError ? err.message : getErrorMessage(err, "Could not move your account. Please try again."),
        "error"
      );
    }
  }

  useEffect(() => {
    let cancelled = false;
    getRegionMoveStatus(region)
      .then((status) => {
        if (!cancelled && status.active && status.targetRegion) runMove(status.targetRegion);
      })
      .catch(() => {
        // No active move to resume, or the check itself failed -- either way just start clean.
      });
    return () => {
      cancelled = true;
    };
    // Only re-check on region change; runMove is stable enough for this one-shot resume check.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region]);

  const moving = movingTo !== null;

  return (
    <div>
      <SettingsHeader title="Server region" />
      <div className="flex max-w-sm flex-col gap-3 text-left">
        {(Object.keys(REGION_META) as Region[]).map((option) => {
          const { label, description, icon: Icon } = REGION_META[option];
          const selected = option === region;
          const isTarget = movingTo === option;
          return (
            <button
              key={option}
              type="button"
              onClick={() => {
                if (moving || selected) return;
                runMove(option);
              }}
              disabled={moving}
              className={`relative flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-all duration-200 disabled:cursor-not-allowed ${
                moving && !isTarget ? "opacity-50" : ""
              } ${
                selected
                  ? "border-accent-blue bg-accent-blue/[0.08] shadow-[0_0_20px_rgba(0,210,255,0.35)]"
                  : "border-border-soft bg-white/[0.03] enabled:hover:border-white/20"
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
                <span className="text-[1.05rem] font-extrabold text-white">{label}</span>
                <p className="mt-0.5 text-[0.8rem] text-text-muted">{description}</p>
              </div>
              {isTarget ? (
                <ProgressRing percent={percent} />
              ) : (
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                    selected ? "border-accent-blue bg-accent-blue text-black" : "border-white/20 text-transparent"
                  }`}
                >
                  <FaCheck className="h-3 w-3" />
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function LegacyServerRegionSettings() {
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
    function sync() {
      if (settings) setRegion(settings.preferred_server_region ?? guessServerRegion());
    }
    sync();
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

export function ServerRegionSettings() {
  return isMultiRegionEnabled() ? <ActiveRegionDisplay /> : <LegacyServerRegionSettings />;
}
