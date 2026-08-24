"use client";

import { useStudySettingsContext } from "@/lib/client-data/StudySettingsContext";
import { SettingsHeader } from "@/app/components/ui/SettingsHeader";
import type { StudySettings } from "@/lib/types";
import { StudySettingsForm } from "./StudySettingsForm";

// Shown (and locked, via StudySettingsForm's `disabled`) until the real row loads -- lets the
// page render its final layout immediately instead of a skeleton standing in for it. Every
// field here matches user_study_settings' own DB defaults for a freshly onboarded user, so a
// fast load never visibly "corrects" a value the user didn't touch.
const DEFAULT_SETTINGS: StudySettings = {
  user_id: "",
  new_kanji_per_day: 1,
  new_vocab_per_day: 6,
  max_reviews_per_day: 50,
  enabled_levels: ["N5"],
  include_lower_levels: false,
  study_kanji: true,
  study_vocabulary: true,
  study_track: "standard",
  study_hiragana: false,
  study_katakana: false,
  new_hiragana_per_day: 15,
  new_katakana_per_day: 15,
  updated_at: "",
  onboarding_completed: true,
  onboarding_step: 0,
  onboarding_furthest_step: 0,
  preferred_server_region: null,
  leaderboard_anonymous: false,
  leaderboard_alias_id: null,
  leaderboard_alias: null,
};

export default function SettingsStudyPage() {
  const { data: settings, status, error, refetch } = useStudySettingsContext();

  return (
    <div>
      <SettingsHeader
        title="Study settings"
        description="Control how many new cards you see per day and which JLPT levels are active."
      />

      {status === "error" && (
        <p className="mb-5.5 text-sm text-text-muted">{error ?? "Couldn't load your settings — try reloading the page."}</p>
      )}

      {/* Keyed on load state so the form remounts (and its local state resets from the
          placeholder defaults to the real row) the one time loading actually finishes --
          background refetches after that keep `status` at "loaded" and don't re-key. */}
      <StudySettingsForm
        key={settings ? "loaded" : "loading"}
        initial={settings ?? DEFAULT_SETTINGS}
        onSaved={refetch}
        disabled={!settings}
      />
    </div>
  );
}
