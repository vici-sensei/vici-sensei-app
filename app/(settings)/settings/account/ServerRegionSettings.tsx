"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useIsAdmin } from "@/lib/auth/useIsAdmin";
import { updateStudySettings } from "@/lib/client-data/studySettings";
import { useStudySettingsContext } from "@/lib/client-data/StudySettingsContext";
import { getRegionMoveStatus, moveToOtherRegion, type RegionMoveStatus } from "@/lib/client-data/account";
import { ApiError, getErrorMessage } from "@/lib/api/client";
import { useToast } from "@/app/components/ui/Toast";
import { SettingsHeader } from "@/app/components/ui/SettingsHeader";
import { RegionSelector } from "@/app/components/ui/RegionSelector";
import { Button } from "@/app/components/ui/Button";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { guessServerRegion, type ServerRegion } from "@/lib/serverRegion";
import { getActiveRegion, isMultiRegionEnabled, type Region } from "@/lib/supabase/regions";

const REGION_NAME: Record<Region, string> = { eu: "Europe", us: "the Americas" };
const OTHER_REGION: Record<Region, Region> = { eu: "us", us: "eu" };

/** Behind NEXT_PUBLIC_MULTI_REGION, the region a signed-in user is in is a real, settled fact
 * (decided at login -- see app/login/page.tsx -- and enforced by the "Before User Created" hook),
 * not a preference to edit here directly. Self-service moving between regions goes through
 * `moveToOtherRegion()` (lib/client-data/account.ts -> the Worker's /api/region-move/* -- see
 * worker/lib/regionMove.ts), not a simple field edit. `getActiveRegion()` reflects whichever
 * project createClient() is actually talking to for this session. */
function ActiveRegionDisplay() {
  const { user } = useAuth();
  const isAdmin = useIsAdmin(user);
  const { showToast } = useToast();
  const region = getActiveRegion();
  const targetRegion = OTHER_REGION[region];

  const [moveStatus, setMoveStatus] = useState<RegionMoveStatus | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [moving, setMoving] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getRegionMoveStatus(region)
      .then((status) => {
        if (!cancelled) setMoveStatus(status);
      })
      .catch(() => {
        // A failed status check just means the button starts in its normal (non-resume) state --
        // moveToOtherRegion() below would surface any real problem when actually clicked.
      });
    return () => {
      cancelled = true;
    };
  }, [region]);

  async function handleConfirmMove() {
    setConfirmOpen(false);
    setMoving(true);
    setProgress(null);
    try {
      await moveToOtherRegion(region, targetRegion, setProgress);
      window.location.href = "/dashboard";
    } catch (err) {
      setMoving(false);
      showToast(
        err instanceof ApiError ? err.message : getErrorMessage(err, "Could not move your account. Please try again."),
        "error"
      );
    }
  }

  const resuming = moveStatus?.active === true;

  return (
    <div>
      <SettingsHeader title="Server region" description="Automatically set to the region closest to you." />
      <p className="max-w-sm text-left text-sm text-text-muted">
        Your account is in <span className="font-semibold text-white">{REGION_NAME[region]}</span>.
      </p>

      {isAdmin !== "admin" && (
        <div className="mt-4">
          <Button variant="secondary" size="sm" onClick={() => setConfirmOpen(true)} disabled={moving}>
            {resuming ? `Resume move to ${REGION_NAME[targetRegion]}` : `Move to ${REGION_NAME[targetRegion]}`}
          </Button>
        </div>
      )}

      {confirmOpen && (
        <ConfirmDialog
          title={`Move your account to ${REGION_NAME[targetRegion]}?`}
          description={`Your progress, streak, and subscription will be copied to ${REGION_NAME[targetRegion]} and you'll be signed in there automatically. Your current account keeps working for a few minutes while this runs, then stops -- it's kept for 30 days as a safety net, but you won't be able to use it after the move completes.`}
          confirmLabel="Move my account"
          onConfirm={handleConfirmMove}
          onCancel={() => setConfirmOpen(false)}
        />
      )}

      {moving && (
        <div className="fixed inset-0 z-50 bg-bg-primary/95">
          <FullScreenLoader />
          <p className="absolute inset-x-0 bottom-[35%] px-6 text-center text-sm text-text-muted">
            {progress ? `Moving your account (${progress})…` : "Moving your account…"} This can take a minute, please
            don&apos;t close this tab.
          </p>
        </div>
      )}
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
