"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useStudySettingsContext } from "@/lib/client-data/StudySettingsContext";

/** Kana-track users have nothing to browse under kanji/vocabulary (see BrowseTabs, which hides
 * those tabs for the same users) -- bounce them to Hiragana if they land on either page directly
 * (stale Explore link, bookmark, typed URL, back button). */
export function useRedirectIfKana() {
  const router = useRouter();
  const { data: settings } = useStudySettingsContext();

  useEffect(() => {
    if (settings?.study_track === "kana") {
      router.replace("/browse/hiragana");
    }
  }, [settings?.study_track, router]);
}
