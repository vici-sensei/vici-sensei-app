"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { guessCountryFromTimezone } from "@/lib/timezoneCountry";
import { guessServerRegion, type ServerRegion } from "@/lib/serverRegion";
import { JLPT_LEVELS, mostAdvancedLevel, type JlptLevel } from "@/lib/srs/constants";
import { enabledLevelsFor } from "@/app/components/ui/LevelGrid";
import { Button } from "@/app/components/ui/Button";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { useToast } from "@/app/components/ui/Toast";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  completeOnboarding,
  rerollLeaderboardAlias,
  updateStudySettings,
  useStudySettings,
} from "@/lib/client-data/studySettings";
import { updateCountry, updateDisplayName, useUserProfile } from "@/lib/client-data/userProfile";
import { MAX_DISPLAY_NAME_LENGTH, type LeaderboardAlias, type StudySettingsPatch } from "@/lib/types";
import { OnboardingProgress } from "./OnboardingProgress";
import { StepKana } from "./steps/StepKana";
import { StepLevel } from "./steps/StepLevel";
import { StepCountry } from "./steps/StepCountry";
import { StepRegion } from "./steps/StepRegion";
import { StepProfile } from "./steps/StepProfile";
import { StepLeaderboard } from "./steps/StepLeaderboard";

const STEPS = ["kana", "level", "country", "region", "profile", "leaderboard"] as const;
type Step = (typeof STEPS)[number];

function displayNameCacheKey(userId: string): string {
  return `onboarding:display-name:${userId}`;
}

/** A draft of the name typed on Step 4, mirrored here so it survives a refresh a beat before the debounced DB save (or the network) has a chance to land. */
function readCachedDisplayName(userId: string): string | null {
  try {
    return window.localStorage.getItem(displayNameCacheKey(userId));
  } catch {
    return null;
  }
}

function writeCachedDisplayName(userId: string, name: string): void {
  try {
    window.localStorage.setItem(displayNameCacheKey(userId), name);
  } catch {
    // Ignore -- private browsing / storage disabled / quota exceeded. The DB save still happens.
  }
}

function knowsKanaCacheKey(userId: string): string {
  return `onboarding:knows-kana:${userId}`;
}

/** The answer picked on Step 0 (StepKana), mirrored here so a refresh doesn't lose it before
 * the user has advanced past that step (the only point it's otherwise saved to the DB) --
 * same reasoning as the level cache below. */
function readCachedKnowsKana(userId: string): boolean | null {
  try {
    const raw = window.localStorage.getItem(knowsKanaCacheKey(userId));
    return raw === "true" ? true : raw === "false" ? false : null;
  } catch {
    return null;
  }
}

function writeCachedKnowsKana(userId: string, knowsKana: boolean): void {
  try {
    window.localStorage.setItem(knowsKanaCacheKey(userId), String(knowsKana));
  } catch {
    // Ignore -- private browsing / storage disabled / quota exceeded.
  }
}

function levelCacheKey(userId: string): string {
  return `onboarding:level:${userId}`;
}

/** The level picked on Step 1, mirrored here so a refresh doesn't lose it before the user has advanced past that step (the only point it's otherwise saved to the DB). */
function readCachedLevel(userId: string): JlptLevel | null {
  try {
    const raw = window.localStorage.getItem(levelCacheKey(userId));
    return raw && (JLPT_LEVELS as readonly string[]).includes(raw) ? (raw as JlptLevel) : null;
  } catch {
    return null;
  }
}

function writeCachedLevel(userId: string, level: JlptLevel): void {
  try {
    window.localStorage.setItem(levelCacheKey(userId), level);
  } catch {
    // Ignore -- private browsing / storage disabled / quota exceeded.
  }
}

function countryCacheKey(userId: string): string {
  return `onboarding:country:${userId}`;
}

/** The country picked on Step 2, mirrored here so a refresh doesn't lose it -- also saved to the DB immediately, but the cache avoids waiting on that fetch to resume it, and stops the timezone guess from ever showing again once a real pick exists. */
function readCachedCountry(userId: string): string | null {
  try {
    return window.localStorage.getItem(countryCacheKey(userId));
  } catch {
    return null;
  }
}

function writeCachedCountry(userId: string, code: string): void {
  try {
    window.localStorage.setItem(countryCacheKey(userId), code);
  } catch {
    // Ignore -- private browsing / storage disabled / quota exceeded.
  }
}

function regionCacheKey(userId: string): string {
  return `onboarding:region:${userId}`;
}

/** The server region picked on Step 3, mirrored here so a refresh doesn't lose it -- also saved to the DB immediately, and stops the timezone guess from ever showing again once a real pick exists. */
function readCachedRegion(userId: string): ServerRegion | null {
  try {
    const raw = window.localStorage.getItem(regionCacheKey(userId));
    return raw === "America" || raw === "Europe" ? raw : null;
  } catch {
    return null;
  }
}

function writeCachedRegion(userId: string, region: ServerRegion): void {
  try {
    window.localStorage.setItem(regionCacheKey(userId), region);
  } catch {
    // Ignore -- private browsing / storage disabled / quota exceeded.
  }
}

function anonymousCacheKey(userId: string): string {
  return `onboarding:leaderboard-anonymous:${userId}`;
}

/** The toggle picked on Step 5, mirrored here so a refresh doesn't lose it -- unlike the other fields above, this one's saved to the DB immediately too, but the cache still avoids waiting on that fetch to resume it. */
function readCachedAnonymous(userId: string): boolean | null {
  try {
    const raw = window.localStorage.getItem(anonymousCacheKey(userId));
    return raw === "true" ? true : raw === "false" ? false : null;
  } catch {
    return null;
  }
}

function writeCachedAnonymous(userId: string, value: boolean): void {
  try {
    window.localStorage.setItem(anonymousCacheKey(userId), String(value));
  } catch {
    // Ignore -- private browsing / storage disabled / quota exceeded.
  }
}

export default function OnboardingPage() {
  const { user } = useAuth();
  const { data: profile, status: profileStatus } = useUserProfile(user);
  const { data: studySettings, status: studySettingsStatus } = useStudySettings(user);
  const { showToast } = useToast();
  const router = useRouter();

  const [stepIndex, setStepIndex] = useState(0);
  const [progressSeeded, setProgressSeeded] = useState(false);
  // The furthest step ever reached (separate from `stepIndex`, the current one) -- so the
  // progress bar can keep dimming/allowing clicks on steps the user has already seen, even
  // after they've navigated back to an earlier one.
  const [maxStepReached, setMaxStepReached] = useState(0);
  const [submitting, setSubmitting] = useState(false);

  const [knowsKana, setKnowsKana] = useState<boolean | null>(null);
  const [level, setLevel] = useState<JlptLevel | null>(null);
  const [country, setCountry] = useState<string | null>(null);
  const [recommendedRegion, setRecommendedRegion] = useState<ServerRegion>("Europe");
  const [region, setRegion] = useState<ServerRegion>("Europe");
  const [displayName, setDisplayName] = useState("");
  const [savedName, setSavedName] = useState("");
  const [nameStatus, setNameStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [profileSeeded, setProfileSeeded] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const [anonymous, setAnonymous] = useState<boolean | null>(null);
  const [leaderboardAlias, setLeaderboardAlias] = useState<LeaderboardAlias | null>(null);

  // Guessed client-side only (Intl reflects the browser's timezone, not the
  // server's) -- runs after mount so it doesn't cause a hydration mismatch.
  useEffect(() => {
    if (!user) return;
    // Once a country's actually been picked (and cached), it should never be replaced by the
    // guess again -- the profile-seed effect below would eventually correct it anyway, but this
    // avoids even briefly holding the wrong value.
    if (!readCachedCountry(user.id)) {
      const guessedCountry = guessCountryFromTimezone();
      if (guessedCountry) setCountry(guessedCountry);
    }
    // `recommendedRegion` is just display metadata (ordering/badge), not a selection, so it's
    // always recomputed. `region` is the actual pick -- same guard as country above.
    const guessedRegion = guessServerRegion();
    setRecommendedRegion(guessedRegion);
    if (!readCachedRegion(user.id)) {
      setRegion(guessedRegion);
    }
  }, [user]);

  // The name/photo (pre-filled from Google on signup) can still be loading when this page
  // mounts -- seed local state from it once, loaded, the same way the guesses above do.
  useEffect(() => {
    if (profileSeeded || !user) return;
    if (profileStatus === "loaded" && profile) {
      // A locally cached draft (typed but not yet confirmed saved before a refresh) wins over
      // the DB value -- the debounced autosave below picks it back up and re-saves it.
      const cachedName = readCachedDisplayName(user.id);
      setDisplayName(cachedName ?? profile.display_name ?? "");
      setSavedName(profile.display_name ?? "");
      setAvatarUrl(profile.avatar_url);
      // Unlike the timezone guess, a saved country means the user actually picked one -- it
      // should win over the guess, not the other way round. Cache first (it's the freshest, and
      // avoids waiting on this fetch at all), then the DB value.
      const cachedCountry = readCachedCountry(user.id);
      if (cachedCountry) {
        setCountry(cachedCountry);
      } else if (profile.country) {
        setCountry(profile.country);
      }
      setProfileSeeded(true);
    } else if (profileStatus === "error") {
      setProfileSeeded(true);
    }
  }, [profileStatus, profile, profileSeeded, user]);

  // Autosaves the name a beat after the user stops typing on Step 4, the same way the old
  // profile-settings page does -- and mirrors every keystroke to localStorage immediately, so
  // the draft survives a refresh even before the debounce (or the network) has caught up.
  useEffect(() => {
    if (!user || !profileSeeded) return;
    writeCachedDisplayName(user.id, displayName);

    const trimmed = displayName.trim();
    if (trimmed === savedName || trimmed.length === 0 || trimmed.length > MAX_DISPLAY_NAME_LENGTH) return;

    setNameStatus("saving");
    const timeout = setTimeout(async () => {
      try {
        await updateDisplayName(user.id, trimmed);
        setSavedName(trimmed);
        setNameStatus("saved");
      } catch {
        showToast("Could not save your name.", "error");
        setNameStatus("idle");
      }
    }, 800);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- showToast closes over stable state each render
  }, [displayName, savedName, user, profileSeeded]);

  // Resume at the exact step the user was on when they left, instead of always restarting the
  // wizard from step 1 (or jumping ahead to the furthest step reached) after a refresh. Falls
  // back to step 1 on error rather than blocking the wizard forever on a failed fetch.
  useEffect(() => {
    if (progressSeeded || !user) return;
    if (studySettingsStatus === "loaded" && studySettings) {
      const resumeIndex = Math.min(Math.max(studySettings.onboarding_step, 0), STEPS.length - 1);
      const resumeFurthest = Math.min(
        Math.max(studySettings.onboarding_furthest_step, resumeIndex),
        STEPS.length - 1
      );
      setStepIndex(resumeIndex);
      setMaxStepReached(resumeFurthest);
      // Same cache-first idea as the level below: a locally cached answer (made but not yet
      // advanced past) wins over the DB value. Otherwise, only trust study_track as "the
      // user's actual pick" once they've ever reached past the kana step -- before that it's
      // just the row's default ('standard'), never chosen.
      const cachedKnowsKana = readCachedKnowsKana(user.id);
      if (cachedKnowsKana !== null) {
        setKnowsKana(cachedKnowsKana);
      } else if (resumeFurthest > 0) {
        setKnowsKana(studySettings.study_track === "standard");
      }
      // A locally cached pick (made but not yet advanced past, so never sent to the DB) wins
      // over the DB value. Otherwise, only trust enabled_levels as "the user's actual pick" once
      // they've ever reached past the level step (index 1, after the kana step) -- before that
      // it's just the row's default (N5), never chosen. Uses `resumeFurthest`, not
      // `resumeIndex`, since they may have gone back below step 1 again without that undoing
      // the earlier real pick.
      const cachedLevel = readCachedLevel(user.id);
      if (cachedLevel) {
        setLevel(cachedLevel);
      } else if (resumeFurthest > 1) {
        setLevel(mostAdvancedLevel(studySettings.enabled_levels));
      }
      // Same cache-first idea as the level above. This is null in the DB until the user
      // actually picks one -- so a saved value here should win over the timezone guess, not the
      // other way.
      const cachedRegion = readCachedRegion(user.id);
      if (cachedRegion) {
        setRegion(cachedRegion);
      } else if (studySettings.preferred_server_region) {
        setRegion(studySettings.preferred_server_region);
      }
      // Same cache-first idea as the others. leaderboard_anonymous is nullable specifically so
      // this DB fallback is trustworthy -- null really does mean "never chosen" now, not just
      // "defaulted to false", so resuming on a different device/browser (no local cache) still
      // resolves correctly instead of guessing "with my profile".
      const cachedAnonymous = readCachedAnonymous(user.id);
      if (cachedAnonymous !== null) {
        setAnonymous(cachedAnonymous);
      } else if (studySettings.leaderboard_anonymous !== null) {
        setAnonymous(studySettings.leaderboard_anonymous);
      }
      setLeaderboardAlias(studySettings.leaderboard_alias);
      setProgressSeeded(true);
    } else if (studySettingsStatus === "error") {
      setProgressSeeded(true);
    }
  }, [studySettingsStatus, studySettings, progressSeeded, user]);

  if (!user) return null;
  // Waits for both fetches (step position and profile) so a resumed step never flashes a
  // guessed/empty value before the real saved one (e.g. country) arrives a moment later.
  if (!progressSeeded || !profileSeeded) return <FullScreenLoader />;

  const step = STEPS[stepIndex];
  const isFirstStep = stepIndex === 0;
  const isLastStep = stepIndex === STEPS.length - 1;
  const canAdvance =
    (step !== "kana" || knowsKana !== null) &&
    // The informational StepLevel variant (knowsKana === false) has nothing to pick --
    // its level is already fixed to N5, not chosen.
    (step !== "level" || knowsKana === false || Boolean(level)) &&
    (step !== "country" || Boolean(country)) &&
    (step !== "profile" || (nameStatus !== "saving" && !avatarSaving)) &&
    (step !== "leaderboard" || anonymous !== null);

  // Persists whatever the user picked on `fromStep`, regardless of which direction they're
  // leaving it in (Next, Back, or jumping via the progress bar) -- otherwise only the Next path
  // saved it, so leaving a step any other way silently dropped a change made there.
  function persistStepData(fromStep: Step, extra?: StudySettingsPatch) {
    if (!user) return;
    const patch: StudySettingsPatch = { ...extra };
    // study_track's separation CHECK constraint requires study_kanji/study_vocabulary and
    // study_hiragana/study_katakana to flip together with it, in the same statement -- so this
    // always sends the full set, even though the "Yes" branch is already the row's default,
    // to correctly reverse a prior "No" answer if the user comes back and changes their mind.
    if (fromStep === "kana" && knowsKana !== null) {
      if (knowsKana) {
        patch.study_track = "standard";
        patch.study_kanji = true;
        patch.study_vocabulary = true;
        patch.study_hiragana = false;
        patch.study_katakana = false;
      } else {
        patch.study_track = "kana";
        patch.study_kanji = false;
        patch.study_vocabulary = false;
        patch.study_hiragana = true;
        patch.study_katakana = false;
      }
    }
    if (fromStep === "level" && level) {
      patch.enabled_levels = enabledLevelsFor(level);
    }
    // This step has no real effect yet (no multi-region infra) -- it's just remembered so a
    // refresh keeps whatever the user picked instead of re-guessing.
    if (fromStep === "region") {
      patch.preferred_server_region = region;
    }
    if (Object.keys(patch).length > 0) {
      updateStudySettings(user.id, patch).catch(() => {
        showToast("Couldn't save your progress.", "error");
      });
    }
    // Country lives on a different table (`users`), so it's a separate call rather than part
    // of the patch object above.
    if (fromStep === "country" && country) {
      updateCountry(user.id, country).catch(() => {
        showToast("Couldn't save your progress.", "error");
      });
    }
  }

  // The single place `stepIndex` ever changes -- always records the exact new position
  // (onboarding_step), so a refresh resumes there, and separately grows onboarding_furthest_step
  // only when moving past what was previously reached (used by the progress bar).
  function goToStep(nextIndex: number) {
    const extra: StudySettingsPatch = { onboarding_step: nextIndex };
    if (nextIndex > maxStepReached) {
      setMaxStepReached(nextIndex);
      extra.onboarding_furthest_step = nextIndex;
    }
    persistStepData(step, extra);
    setStepIndex(nextIndex);
  }

  // Cached and persisted on leaving the step (via persistStepData), same as level below --
  // not saved immediately, since it drives a multi-column atomic patch rather than a single field.
  function handleKnowsKanaChange(next: boolean) {
    setKnowsKana(next);
    if (user) writeCachedKnowsKana(user.id, next);
  }

  function handleLevelChange(next: JlptLevel) {
    setLevel(next);
    if (user) writeCachedLevel(user.id, next);
  }

  // Saved immediately (not just on leaving the step) so it survives a refresh right away, and
  // cached so the timezone guess never gets a chance to reappear once a real pick exists.
  function handleCountryChange(next: string) {
    setCountry(next);
    if (!user) return;
    writeCachedCountry(user.id, next);
    updateCountry(user.id, next).catch(() => {
      showToast("Couldn't save your country.", "error");
    });
  }

  // Saved immediately (not just on leaving the step) so it survives a refresh right away, and
  // cached so the timezone guess never gets a chance to reappear once a real pick exists. This
  // step has no real effect yet (no multi-region infra) -- the pick is just remembered.
  function handleRegionChange(next: ServerRegion) {
    setRegion(next);
    if (!user) return;
    writeCachedRegion(user.id, next);
    updateStudySettings(user.id, { preferred_server_region: next }).catch(() => {
      showToast("Couldn't save your region.", "error");
    });
  }

  // Saved immediately (not just at the final step) because turning this on is what makes the
  // DB actually assign a real random alias (assign_leaderboard_alias trigger) -- the preview
  // needs that real alias, not a placeholder, to show what the user will actually appear as.
  async function handleAnonymousChange(next: boolean) {
    setAnonymous(next);
    if (!user) return;
    writeCachedAnonymous(user.id, next);
    try {
      const updated = await updateStudySettings(user.id, { leaderboard_anonymous: next });
      setLeaderboardAlias(updated.leaderboard_alias);
    } catch {
      showToast("Couldn't save your choice.", "error");
    }
  }

  async function handleRerollAlias() {
    try {
      const alias = await rerollLeaderboardAlias();
      setLeaderboardAlias(alias);
    } catch {
      showToast("Couldn't reroll your name.", "error");
    }
  }

  function handleBack() {
    if (isFirstStep || submitting) return;
    goToStep(stepIndex - 1);
  }

  function handleStepClick(index: number) {
    if (submitting || index === stepIndex || index > maxStepReached) return;
    goToStep(index);
  }

  async function handleNext() {
    if (!user) return;
    if (step === "country" && !country) {
      showToast("Please select your country.", "error");
      return;
    }
    if (!isLastStep) {
      goToStep(stepIndex + 1);
      return;
    }
    // canAdvance already blocks this on the level step -- this only covers the case where a
    // refresh resumed past step 1 without a level ever being picked locally in this session.
    // The informational variant (knowsKana === false) has no level to pick -- it's fixed to N5.
    if (knowsKana !== false && !level) {
      showToast("Please pick your JLPT level.", "error");
      setStepIndex(1);
      return;
    }
    // canAdvance already blocks this on the leaderboard step -- this only guards the type.
    if (anonymous === null) return;

    setSubmitting(true);
    try {
      if (country) await updateCountry(user.id, country);
      const trimmedName = displayName.trim();
      // The autosave effect above already persists this as the user types -- only a fallback
      // for whatever hasn't landed yet (e.g. the 800ms debounce hadn't fired).
      if (trimmedName && trimmedName !== savedName) await updateDisplayName(user.id, trimmedName);
      const finalEnabledLevels = knowsKana === false ? (["N5"] as JlptLevel[]) : enabledLevelsFor(level as JlptLevel);
      await completeOnboarding(user.id, finalEnabledLevels, anonymous);
      router.push("/dashboard");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Something went wrong. Please try again.", "error");
      setSubmitting(false);
    }
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden">
      <div
        className="shrink-0 border-b border-border-soft px-6 pb-5"
        style={{ paddingTop: "max(1.5rem, env(safe-area-inset-top))" }}
      >
        <div className="mx-auto w-full max-w-[560px]">
          <OnboardingProgress
            step={stepIndex}
            total={STEPS.length}
            maxReached={maxStepReached}
            onStepClick={handleStepClick}
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
        <div className="mx-auto flex min-h-full w-full max-w-[560px] flex-col justify-center text-center">
          {step === "kana" && <StepKana knowsKana={knowsKana} onChange={handleKnowsKanaChange} />}
          {step === "level" && <StepLevel level={level} onChange={handleLevelChange} knowsKana={knowsKana} />}
          {step === "country" && <StepCountry country={country} onChange={handleCountryChange} />}
          {step === "region" && (
            <StepRegion region={region} recommended={recommendedRegion} onChange={handleRegionChange} />
          )}
          {step === "profile" && (
            <StepProfile
              userId={user.id}
              avatarUrl={avatarUrl}
              onAvatarChange={setAvatarUrl}
              onAvatarSavingChange={setAvatarSaving}
              displayName={displayName}
              onDisplayNameChange={setDisplayName}
              nameStatus={nameStatus}
            />
          )}
          {step === "leaderboard" && (
            <StepLeaderboard
              anonymous={anonymous}
              onChange={handleAnonymousChange}
              userId={user.id}
              displayName={displayName}
              avatarUrl={avatarUrl}
              country={country}
              leaderboardAlias={leaderboardAlias}
              onReroll={handleRerollAlias}
            />
          )}
        </div>
      </div>

      <div
        className="shrink-0 border-t border-border-soft px-6 pt-5"
        style={{ paddingBottom: "max(1.5rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex w-full max-w-[560px] items-center justify-between gap-3">
          <Button
            type="button"
            variant="secondary"
            onClick={handleBack}
            disabled={submitting}
            className={isFirstStep ? "invisible" : ""}
          >
            Back
          </Button>
          <Button type="button" onClick={handleNext} loading={submitting} disabled={!canAdvance}>
            {isLastStep ? "Get started" : step === "level" && knowsKana === false ? "Continue" : "Next"}
          </Button>
        </div>
      </div>
    </div>
  );
}
