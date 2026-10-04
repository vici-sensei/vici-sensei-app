"use client";

import { useEffect, useState } from "react";
import {
  getActiveRegion,
  hasStoredActiveRegion,
  isMultiRegionEnabled,
  isRegion,
  setActiveRegion,
  workerOrigin,
  type Region,
} from "@/lib/supabase/regions";

/**
 * The region the login/signup pages currently point at, or `null` when multi-region is off (then
 * there is nothing to pick). Shared by every page that talks to Supabase before there is a session,
 * so they all show the same picker state.
 *
 * getActiveRegion() always resolves synchronously (persisted, or a timezone-based guess) -- that is
 * shown immediately so the picker never flashes empty. Only a first-time visitor (nothing persisted
 * yet) gets upgraded to the Worker's real geo-IP guess, once it's back.
 */
export function useAuthRegion(): [Region | null, (region: Region) => void] {
  const [region, setRegion] = useState<Region | null>(null);

  useEffect(() => {
    if (!isMultiRegionEnabled()) return;
    const initial = getActiveRegion();
    // localStorage only exists in the browser, so this can't be the initial state (it would
    // mismatch the statically exported HTML). Wrapped the same way ProfileSettingsForm does it.
    function sync() {
      setRegion(initial);
    }
    sync();
    if (hasStoredActiveRegion()) return;

    let cancelled = false;
    fetch(`${workerOrigin()}/api/geo`)
      .then((res) => res.json())
      .then((body: { region?: unknown }) => {
        if (cancelled || !isRegion(body.region) || body.region === initial) return;
        setActiveRegion(body.region);
        setRegion(body.region);
      })
      .catch(() => {
        // Offline / Worker unreachable -- keep the timezone-based guess already shown.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return [region, setRegion];
}
