"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { acknowledgeAchievements, fetchUnacknowledgedAchievements } from "@/lib/data/achievements";
import { ACHIEVEMENT_CATALOG, type AchievementCatalogEntry } from "@/lib/achievements/registry";
import { NewAchievementsModal } from "@/app/components/study/NewAchievementsModal";

/** The celebration modal for achievements the student has earned but not seen yet, for the screens
 * that end a run of work (/study/summary, the reading-test summary). Returns the modal to render,
 * or null when there is nothing to show.
 *
 * It looks for whatever is still unacknowledged on arrival rather than "earned since the last
 * page" -- the page that navigated here does so off an optimistic local-state change, before the
 * write that earns the achievement is guaranteed to have reached the server, so a same-instant
 * "earned since X" query could run before the award trigger fired and miss it. Checking what is
 * unacknowledged doesn't lose the celebration to that race, and doesn't lose it forever if it is
 * missed (it surfaces on the next visit). `onlyKeys` narrows it to the achievements the current
 * screen can actually have earned. */
export function useUnacknowledgedAchievements(userId: string, onlyKeys?: readonly string[]): ReactNode {
  const [entries, setEntries] = useState<AchievementCatalogEntry[]>([]);
  // One check per visit, whatever re-renders (or Strict Mode's double effect) do to the effect below.
  const checkedRef = useRef(false);

  useEffect(() => {
    if (checkedRef.current) return;
    checkedRef.current = true;
    fetchUnacknowledgedAchievements(createClient(), userId)
      .then((keys) => {
        const relevant = onlyKeys ? keys.filter((key) => onlyKeys.includes(key)) : keys;
        if (relevant.length === 0) return;
        setEntries(ACHIEVEMENT_CATALOG.filter((entry) => relevant.includes(entry.achievementKey)));
      })
      .catch(() => {
        // Non-critical -- worst case the celebration is missed this visit; the achievement stays
        // unacknowledged and will still surface next time.
      });
  }, [userId, onlyKeys]);

  if (entries.length === 0) return null;
  return (
    <NewAchievementsModal
      entries={entries}
      onClose={() => {
        const keys = entries.map((entry) => entry.achievementKey);
        setEntries([]);
        void acknowledgeAchievements(createClient(), keys).catch(() => {
          // Non-critical -- worst case the same achievement is shown again next visit.
        });
      }}
    />
  );
}
