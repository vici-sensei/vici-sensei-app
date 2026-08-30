"use client";

import { useEffect, useState } from "react";
import { LevelGrid } from "@/app/components/ui/LevelGrid";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { Toggle } from "@/app/components/ui/Toggle";
import { Stepper, stepperButtonClass, stepperValueClass } from "@/app/components/ui/Stepper";
import { fieldLabel, fieldHint } from "@/app/components/ui/formClasses";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { updateStudySettings, rerollLeaderboardAlias, fetchHiraganaMastered } from "@/lib/client-data/studySettings";
import { useToast } from "@/app/components/ui/Toast";
import type { LeaderboardAlias, StudySettings, StudySettingsPatch } from "@/lib/types";
import { JLPT_LEVELS, mostAdvancedLevel, leastAdvancedLevel, levelsInRange, type JlptLevel } from "@/lib/srs/constants";
import { FaLink, FaMinus, FaPlus } from "react-icons/fa6";
import { LeaderboardAliasDice } from "./LeaderboardAliasDice";

const REVIEWS_STEP = 10;
const KANA_STEP = 5;
const KANA_MIN = 15;
const AUTOSAVE_DELAY_MS = 500;

type Snapshot = {
  newKanjiPerDay: number;
  newVocabPerDay: number;
  newHiraganaPerDay: number;
  newKatakanaPerDay: number;
  maxReviewsPerDay: number;
  level: JlptLevel;
  floor: JlptLevel;
  studyKanji: boolean;
  studyVocabulary: boolean;
  studyHiragana: boolean;
  studyKatakana: boolean;
  leaderboardAnonymous: boolean;
};

function snapshotFrom(settings: StudySettings): Snapshot {
  return {
    newKanjiPerDay: settings.new_kanji_per_day,
    newVocabPerDay: settings.new_vocab_per_day,
    newHiraganaPerDay: settings.new_hiragana_per_day,
    newKatakanaPerDay: settings.new_katakana_per_day,
    maxReviewsPerDay: settings.max_reviews_per_day,
    level: mostAdvancedLevel(settings.enabled_levels),
    floor: leastAdvancedLevel(settings.enabled_levels),
    studyKanji: settings.study_kanji,
    studyVocabulary: settings.study_vocabulary,
    studyHiragana: settings.study_hiragana,
    studyKatakana: settings.study_katakana,
    leaderboardAnonymous: settings.leaderboard_anonymous ?? false,
  };
}

function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  return (
    a.newKanjiPerDay === b.newKanjiPerDay &&
    a.newVocabPerDay === b.newVocabPerDay &&
    a.newHiraganaPerDay === b.newHiraganaPerDay &&
    a.newKatakanaPerDay === b.newKatakanaPerDay &&
    a.maxReviewsPerDay === b.maxReviewsPerDay &&
    a.level === b.level &&
    a.floor === b.floor &&
    a.studyKanji === b.studyKanji &&
    a.studyVocabulary === b.studyVocabulary &&
    a.studyHiragana === b.studyHiragana &&
    a.studyKatakana === b.studyKatakana &&
    a.leaderboardAnonymous === b.leaderboardAnonymous
  );
}

export function StudySettingsForm({
  initial,
  onSaved,
  disabled = false,
}: {
  initial: StudySettings;
  onSaved: () => void;
  /** True while real settings are still loading -- `initial` is a placeholder default in that case, so every control is locked to prevent editing (and thus autosaving) values that aren't the user's own yet. */
  disabled?: boolean;
}) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [newKanjiPerDay, setNewKanjiPerDay] = useState(initial.new_kanji_per_day);
  const [newVocabPerDay, setNewVocabPerDay] = useState(initial.new_vocab_per_day);
  const [newHiraganaPerDay, setNewHiraganaPerDay] = useState(initial.new_hiragana_per_day);
  const [newKatakanaPerDay, setNewKatakanaPerDay] = useState(initial.new_katakana_per_day);
  const [maxReviewsPerDay, setMaxReviewsPerDay] = useState(initial.max_reviews_per_day);
  const [level, setLevel] = useState<JlptLevel>(mostAdvancedLevel(initial.enabled_levels));
  const [floor, setFloor] = useState<JlptLevel>(leastAdvancedLevel(initial.enabled_levels));
  const [studyKanji, setStudyKanji] = useState(initial.study_kanji);
  const [studyVocabulary, setStudyVocabulary] = useState(initial.study_vocabulary);
  const [studyHiragana, setStudyHiragana] = useState(initial.study_hiragana);
  const [studyKatakana, setStudyKatakana] = useState(initial.study_katakana);
  // Coerced to a definite boolean here -- null (onboarding not yet chosen) shouldn't reach this
  // page in practice, since /onboarding gates access before it, but the toggle itself is binary.
  const [leaderboardAnonymous, setLeaderboardAnonymous] = useState(initial.leaderboard_anonymous ?? false);
  const [leaderboardAlias, setLeaderboardAlias] = useState<LeaderboardAlias | null>(initial.leaderboard_alias);
  // Not part of the autosaved Snapshot below -- only ever changed by handleCrossTrack's own
  // atomic save, never by the periodic autosave.
  const [studyTrack, setStudyTrack] = useState(initial.study_track);
  const [saved, setSaved] = useState<Snapshot>(() => snapshotFrom(initial));
  // null while unknown (still loading) -- treated the same as "not mastered" everywhere below,
  // so the katakana toggle never flashes enabled before this resolves. Fetched once per mount
  // rather than re-synced on every settings change, since a user isn't studying hiragana to
  // completion in the middle of a Settings visit.
  const [hiraganaMastered, setHiraganaMastered] = useState<boolean | null>(null);
  // Tracks which of kanji/vocabulary just turned on as a side effect of the user directly
  // toggling the other one (crossing from the kana track turns both on together). Purely a
  // live UI cue for the toggle that got flipped "for free" -- never persisted, and cleared
  // below the moment that toggle turns off or locks, so a page reload never resurrects it.
  const [justCrossedPartner, setJustCrossedPartner] = useState<"kanji" | "vocabulary" | null>(null);
  // Mirrors justCrossedPartner for the opposite direction: whichever of hiragana/katakana was
  // on when the user crossed to the standard track (by turning on kanji or vocabulary) got
  // turned off as a side effect, not by a direct click on it. Cleared the moment that toggle
  // turns back on -- live UI-only, never persisted or derived from `initial`.
  const [hiraganaJustCrossedOff, setHiraganaJustCrossedOff] = useState(false);
  const [katakanaJustCrossedOff, setKatakanaJustCrossedOff] = useState(false);
  // Mirrors hiraganaJustCrossedOff/katakanaJustCrossedOff for the reverse crossing: whichever of
  // kanji/vocabulary was on when the user crossed to the kana track (by turning on hiragana or
  // katakana) got turned off as a side effect. Same live-only, cleared-on-turn-back-on contract.
  const [kanjiJustCrossedOff, setKanjiJustCrossedOff] = useState(false);
  const [vocabularyJustCrossedOff, setVocabularyJustCrossedOff] = useState(false);
  // Set when crossing from the standard track to kana turns katakana on together with hiragana,
  // because hiragana was already fully mastered from a previous stint on the kana track (the
  // backend's hiragana_auto_activate_katakana_trigger only fires on a hiragana review-progress
  // update, so it can't cover this settings-toggle path -- this cue plus the matching
  // study_katakana: true in toggleStudyHiragana below replicates that same recommendation here).
  // Live UI-only, cleared the moment studyKatakana turns off, same contract as the cues above.
  const [katakanaAutoEnabled, setKatakanaAutoEnabled] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    fetchHiraganaMastered(user.id)
      .then((mastered) => {
        if (!cancelled) setHiraganaMastered(mastered);
      })
      .catch(() => {
        // Leaves it at null (locked) -- a failed check should never accidentally unlock katakana.
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  // A background refetch (any autosave calls onSaved -> refetch) hands us a fresh
  // `initial` — resync the alias from it the same way ProfileSettingsForm resyncs
  // avatarUrl, since the alias can also change server-side (the assignment trigger)
  // independent of whatever patch this component itself just sent.
  useEffect(() => {
    setLeaderboardAlias(initial.leaderboard_alias);
  }, [initial.leaderboard_alias]);

  useEffect(() => {
    setStudyTrack(initial.study_track);
  }, [initial.study_track]);

  // Clears the "turned on together" cue the instant its toggle turns off or locks (goes
  // disabled) -- e.g. the user turns kanji back off, or turns vocabulary off so kanji becomes
  // the sole active one and locks. Reacts to live toggle state only, never to `initial`/the
  // database, so a refetch or page reload never resurrects a stale cue.
  useEffect(() => {
    if (justCrossedPartner === "vocabulary") {
      const vocabularyLocked = disabled || (studyVocabulary && !studyKanji);
      if (!studyVocabulary || vocabularyLocked) setJustCrossedPartner(null);
    } else if (justCrossedPartner === "kanji") {
      const kanjiLocked = disabled || (studyKanji && !studyVocabulary);
      if (!studyKanji || kanjiLocked) setJustCrossedPartner(null);
    }
  }, [justCrossedPartner, studyKanji, studyVocabulary, disabled]);

  useEffect(() => {
    if (studyHiragana && hiraganaJustCrossedOff) setHiraganaJustCrossedOff(false);
  }, [studyHiragana, hiraganaJustCrossedOff]);

  useEffect(() => {
    if (studyKatakana && katakanaJustCrossedOff) setKatakanaJustCrossedOff(false);
  }, [studyKatakana, katakanaJustCrossedOff]);

  useEffect(() => {
    if (studyKanji && kanjiJustCrossedOff) setKanjiJustCrossedOff(false);
  }, [studyKanji, kanjiJustCrossedOff]);

  useEffect(() => {
    if (studyVocabulary && vocabularyJustCrossedOff) setVocabularyJustCrossedOff(false);
  }, [studyVocabulary, vocabularyJustCrossedOff]);

  useEffect(() => {
    if (!studyKatakana && katakanaAutoEnabled) setKatakanaAutoEnabled(false);
  }, [studyKatakana, katakanaAutoEnabled]);

  function adjustKanji(delta: number) {
    const next = Math.max(1, newKanjiPerDay + delta);
    setNewKanjiPerDay(next);
    setNewVocabPerDay(next * 6);
  }

  function adjustVocab(delta: number) {
    const next = Math.max(6, newVocabPerDay + delta * 6);
    setNewVocabPerDay(next);
    setNewKanjiPerDay(Math.round(next / 6));
  }

  function adjustReviews(delta: number) {
    setMaxReviewsPerDay((v) => Math.max(REVIEWS_STEP, v + delta * REVIEWS_STEP));
  }

  function adjustHiragana(delta: number) {
    setNewHiraganaPerDay((v) => Math.max(KANA_MIN, v + delta * KANA_STEP));
  }

  function adjustKatakana(delta: number) {
    setNewKatakanaPerDay((v) => Math.max(KANA_MIN, v + delta * KANA_STEP));
  }

  function handleLevelChange(nextLevel: JlptLevel) {
    // If lower levels weren't included before, they shouldn't switch on just because the
    // current level moved — keep the toggle off by tracking the floor to the new level too.
    // Otherwise, just keep the floor from ever sitting above the newly picked level.
    const wasOff = floor === level;
    setLevel(nextLevel);
    if (wasOff || JLPT_LEVELS.indexOf(floor) > JLPT_LEVELS.indexOf(nextLevel)) setFloor(nextLevel);
  }

  function toggleLowerLevels() {
    setFloor(floor === level ? "N5" : level);
  }

  function adjustFloor(delta: number) {
    // Capped at the current level itself (not one below it) -- stepping the floor all the way
    // up to `level` is a valid way to turn "also study lower levels" back off, same as the
    // toggle above, and floor === level already hides this row on its own via the check below.
    const maxFloorIdx = JLPT_LEVELS.indexOf(level);
    const next = JLPT_LEVELS.indexOf(floor) + delta;
    setFloor(JLPT_LEVELS[Math.max(0, Math.min(maxFloorIdx, next))]);
  }

  function toggleStudyKanji() {
    if (studyTrack === "standard") {
      if (studyKanji && !studyVocabulary) return;
      setStudyKanji(!studyKanji);
      return;
    }
    // Currently on the kana track, where study_kanji is always false -- this toggle only ever
    // turns it on, which crosses tracks. See handleCrossTrack for why that must be one atomic save.
    // Crossing activates both kanji and vocabulary together, not just the one toggled -- matches
    // the state a student lands in via kana-track graduation, so manually starting standard from
    // either toggle doesn't leave them in a lopsided kanji-only/vocab-only state.
    const crossedOffKana: Array<"hiragana" | "katakana"> = [];
    if (studyHiragana) crossedOffKana.push("hiragana");
    if (studyKatakana) crossedOffKana.push("katakana");
    void handleCrossTrack(
      {
        study_track: "standard",
        study_kanji: true,
        study_vocabulary: true,
        study_hiragana: false,
        study_katakana: false,
      },
      { crossedPartner: "vocabulary", crossedOffKana },
    );
  }

  function toggleStudyVocabulary() {
    if (studyTrack === "standard") {
      if (studyVocabulary && !studyKanji) return;
      setStudyVocabulary(!studyVocabulary);
      return;
    }
    const crossedOffKana: Array<"hiragana" | "katakana"> = [];
    if (studyHiragana) crossedOffKana.push("hiragana");
    if (studyKatakana) crossedOffKana.push("katakana");
    void handleCrossTrack(
      {
        study_track: "standard",
        study_kanji: true,
        study_vocabulary: true,
        study_hiragana: false,
        study_katakana: false,
      },
      { crossedPartner: "kanji", crossedOffKana },
    );
  }

  function toggleStudyHiragana() {
    if (studyTrack === "kana") {
      if (studyHiragana && !studyKatakana) return;
      setStudyHiragana(!studyHiragana);
      return;
    }
    const crossedOffStandard: Array<"kanji" | "vocabulary"> = [];
    if (studyKanji) crossedOffStandard.push("kanji");
    if (studyVocabulary) crossedOffStandard.push("vocabulary");
    // Hiragana was already fully mastered on a previous stint on the kana track -- there's no
    // reason to make the user flip katakana on by hand too, so turn it on together and explain
    // why via the autoEnabledKatakana cue.
    const autoEnableKatakana = !studyKatakana && Boolean(hiraganaMastered);
    void handleCrossTrack(
      {
        study_track: "kana",
        study_hiragana: true,
        study_katakana: autoEnableKatakana ? true : studyKatakana,
        study_kanji: false,
        study_vocabulary: false,
        // Required alongside study_track by the kana_level_check CHECK constraint -- see
        // handleCrossTrack's comment. Without this, a user who'd picked a level above N5 on the
        // standard track would hit a DB constraint violation crossing over here instead of
        // resetting to N5, same as onboarding's handleKnowsKanaChange does for its "No" branch.
        enabled_levels: ["N5"],
      },
      { crossedOffStandard, autoEnabledKatakana: autoEnableKatakana },
    );
  }

  function toggleStudyKatakana() {
    if (studyTrack === "kana") {
      if (studyKatakana && !studyHiragana) return;
      // Katakana can only ever be turned ON once every hiragana character is mastered --
      // turning it back off is always allowed, same gate the DB trigger enforces server-side
      // (enforce_katakana_requires_hiragana_trigger, 20260825_enforce_katakana_requires_hiragana.sql).
      if (!studyKatakana && !hiraganaMastered) return;
      setStudyKatakana(!studyKatakana);
      return;
    }
    if (!hiraganaMastered) return;
    const crossedOffStandard: Array<"kanji" | "vocabulary"> = [];
    if (studyKanji) crossedOffStandard.push("kanji");
    if (studyVocabulary) crossedOffStandard.push("vocabulary");
    void handleCrossTrack(
      {
        study_track: "kana",
        study_katakana: true,
        study_hiragana: studyHiragana,
        study_kanji: false,
        study_vocabulary: false,
        enabled_levels: ["N5"],
      },
      { crossedOffStandard },
    );
  }

  function revertTo(snapshot: Snapshot) {
    setNewKanjiPerDay(snapshot.newKanjiPerDay);
    setNewVocabPerDay(snapshot.newVocabPerDay);
    setNewHiraganaPerDay(snapshot.newHiraganaPerDay);
    setNewKatakanaPerDay(snapshot.newKatakanaPerDay);
    setMaxReviewsPerDay(snapshot.maxReviewsPerDay);
    setLevel(snapshot.level);
    setFloor(snapshot.floor);
    setStudyKanji(snapshot.studyKanji);
    setStudyVocabulary(snapshot.studyVocabulary);
    setStudyHiragana(snapshot.studyHiragana);
    setStudyKatakana(snapshot.studyKatakana);
    setLeaderboardAnonymous(snapshot.leaderboardAnonymous);
  }

  async function handleReroll() {
    try {
      const alias = await rerollLeaderboardAlias();
      setLeaderboardAlias(alias);
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not reroll your name.", "error");
    }
  }

  // Track separation's CHECK constraint requires study_kanji/study_vocabulary and
  // study_hiragana/study_katakana to flip together with study_track, in the same statement --
  // same reasoning as onboarding's persistStepData for the kana step. Reversible in both
  // directions: switching to kana never deletes progress, resets enabled_levels to N5 (required
  // by kana_level_check, same as onboarding's "No" branch), and switching back to standard
  // doesn't touch enabled_levels (stays N5 until the user picks a level again).
  async function handleCrossTrack(
    patch: StudySettingsPatch,
    cues?: {
      crossedPartner?: "kanji" | "vocabulary";
      crossedOffKana?: Array<"hiragana" | "katakana">;
      crossedOffStandard?: Array<"kanji" | "vocabulary">;
      autoEnabledKatakana?: boolean;
    },
  ) {
    if (!user) return;
    try {
      const updated = await updateStudySettings(user.id, patch);
      setStudyTrack(updated.study_track);
      setStudyKanji(updated.study_kanji);
      setStudyVocabulary(updated.study_vocabulary);
      setStudyHiragana(updated.study_hiragana);
      setStudyKatakana(updated.study_katakana);
      // Set only once the cross-track save has actually landed -- studyKanji/studyVocabulary
      // above are the freshly confirmed values, so the "clear" effect (keyed on those same
      // state vars) never races against this and wipes the cue before it can render.
      if (cues?.crossedPartner) setJustCrossedPartner(cues.crossedPartner);
      if (cues?.crossedOffKana?.includes("hiragana")) setHiraganaJustCrossedOff(true);
      if (cues?.crossedOffKana?.includes("katakana")) setKatakanaJustCrossedOff(true);
      if (cues?.crossedOffStandard?.includes("kanji")) setKanjiJustCrossedOff(true);
      if (cues?.crossedOffStandard?.includes("vocabulary")) setVocabularyJustCrossedOff(true);
      if (cues?.autoEnabledKatakana) setKatakanaAutoEnabled(true);
      // Crossing to kana resets enabled_levels server-side to N5 (see the patches above) --
      // resync local level/floor from the response so the (disabled, but still visible) JLPT
      // grid shows N5 right away instead of whatever level was picked on the standard track,
      // and so the autosave effect's `current` matches `saved` and doesn't fire a redundant PATCH.
      const nextLevel = mostAdvancedLevel(updated.enabled_levels);
      const nextFloor = leastAdvancedLevel(updated.enabled_levels);
      setLevel(nextLevel);
      setFloor(nextFloor);
      setSaved((prev) => ({
        ...prev,
        studyKanji: updated.study_kanji,
        studyVocabulary: updated.study_vocabulary,
        studyHiragana: updated.study_hiragana,
        studyKatakana: updated.study_katakana,
        level: nextLevel,
        floor: nextFloor,
      }));
      onSaved();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not update your study settings.", "error");
    }
  }

  // Autosave a beat after the user stops adjusting settings, batching rapid
  // changes (e.g. several stepper clicks) into a single combined PATCH — the
  // save is atomic (one row update), so a failure reverts every field at once
  // rather than guessing which individual change caused it.
  useEffect(() => {
    if (!user) return;
    const current: Snapshot = {
      newKanjiPerDay,
      newVocabPerDay,
      newHiraganaPerDay,
      newKatakanaPerDay,
      maxReviewsPerDay,
      level,
      floor,
      studyKanji,
      studyVocabulary,
      studyHiragana,
      studyKatakana,
      leaderboardAnonymous,
    };
    if (sameSnapshot(current, saved)) return;

    const timeout = setTimeout(async () => {
      const body: StudySettingsPatch = {
        new_kanji_per_day: current.newKanjiPerDay,
        new_vocab_per_day: current.newVocabPerDay,
        new_hiragana_per_day: current.newHiraganaPerDay,
        new_katakana_per_day: current.newKatakanaPerDay,
        max_reviews_per_day: current.maxReviewsPerDay,
        enabled_levels: levelsInRange(current.floor, current.level),
        include_lower_levels: current.floor !== current.level,
        study_kanji: current.studyKanji,
        study_vocabulary: current.studyVocabulary,
        study_hiragana: current.studyHiragana,
        study_katakana: current.studyKatakana,
        leaderboard_anonymous: current.leaderboardAnonymous,
      };
      try {
        const updated = await updateStudySettings(user.id, body);
        setSaved(current);
        setLeaderboardAlias(updated.leaderboard_alias);
        onSaved();
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : "Could not save your settings.", "error");
        revertTo(saved);
      }
    }, AUTOSAVE_DELAY_MS);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revertTo/onSaved/showToast close over stable state each render
  }, [
    newKanjiPerDay,
    newVocabPerDay,
    newHiraganaPerDay,
    newKatakanaPerDay,
    maxReviewsPerDay,
    level,
    floor,
    studyKanji,
    studyVocabulary,
    studyHiragana,
    studyKatakana,
    leaderboardAnonymous,
    saved,
    user,
  ]);

  const includedLevels = levelsInRange(floor, level);

  // Each is at most one message (or none) for its toggle's amber hint -- computed here so the
  // animated wrapper below can stay mounted at all times and transition between an empty and a
  // populated state, rather than mounting/unmounting the message div (which can't be animated).
  const hiraganaMessage =
    studyHiragana && (disabled || !studyKatakana)
      ? "At least one toggle must stay on."
      : hiraganaJustCrossedOff
        ? "You can't study kana alongside kanji and vocabulary, so this turned off for now."
        : null;

  const katakanaMessage = !hiraganaMastered
    ? "Finish learning all hiragana first to unlock katakana."
    : studyKatakana && (disabled || !studyHiragana)
      ? "At least one toggle must stay on."
      : katakanaAutoEnabled
        ? "You've already learned all hiragana, so we recommend studying katakana too — we turned it on for you."
        : katakanaJustCrossedOff
          ? "You can't study kana alongside kanji and vocabulary, so this turned off for now."
          : null;

  const kanjiMessage =
    studyKanji && (disabled || !studyVocabulary)
      ? "At least one toggle must stay on."
      : justCrossedPartner === "kanji"
        ? "We recommend learning kanji and vocabulary together, so this turned on too."
        : kanjiJustCrossedOff
          ? "You can't study kana alongside kanji and vocabulary, so this turned off for now."
          : null;

  const vocabularyMessage =
    studyVocabulary && (disabled || !studyKanji)
      ? "At least one toggle must stay on."
      : justCrossedPartner === "vocabulary"
        ? "We recommend learning kanji and vocabulary together, so this turned on too."
        : vocabularyJustCrossedOff
          ? "You can't study kana alongside kanji and vocabulary, so this turned off for now."
          : null;

  return (
    <div>
      {studyTrack === "standard" ? (
        <>
          <GlassCard padding="lg" className="mb-5.5">
            <Stepper
              className="mb-[22px]"
              label="New kanji per day"
              value={newKanjiPerDay}
              onDecrement={() => adjustKanji(-1)}
              onIncrement={() => adjustKanji(1)}
              decrementDisabled={newKanjiPerDay <= 1}
              disabled={disabled}
              hint={
                <div className="mt-2.5 flex items-center gap-2 text-sm text-accent-blue [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:shrink-0">
                  <FaLink />
                  Linked 1:6 with new vocabulary — changing one updates the other.
                </div>
              }
            />
            <Stepper
              label="New vocabulary per day"
              value={newVocabPerDay}
              onDecrement={() => adjustVocab(-1)}
              onIncrement={() => adjustVocab(1)}
              decrementDisabled={newVocabPerDay <= 6}
              disabled={disabled}
            />
          </GlassCard>

          <GlassCard padding="lg" className="mb-5.5">
            <Stepper
              label="Max reviews per day"
              value={maxReviewsPerDay}
              onDecrement={() => adjustReviews(-1)}
              onIncrement={() => adjustReviews(1)}
              decrementDisabled={maxReviewsPerDay <= REVIEWS_STEP}
              disabled={disabled}
              hint={<div className={fieldHint}>A hard cap on how many due cards you&apos;ll see in one session.</div>}
            />
          </GlassCard>
        </>
      ) : (
        <>
          <GlassCard padding="lg" className="mb-5.5">
            <Stepper
              className="mb-[22px]"
              label="New hiragana per day"
              value={newHiraganaPerDay}
              onDecrement={() => adjustHiragana(-1)}
              onIncrement={() => adjustHiragana(1)}
              decrementDisabled={newHiraganaPerDay <= KANA_MIN}
              disabled={disabled}
            />
            <Stepper
              label="New katakana per day"
              value={newKatakanaPerDay}
              onDecrement={() => adjustKatakana(-1)}
              onIncrement={() => adjustKatakana(1)}
              decrementDisabled={newKatakanaPerDay <= KANA_MIN}
              disabled={disabled}
            />
          </GlassCard>

          <GlassCard padding="lg" className="mb-5.5">
            <Stepper
              label="Max reviews per day"
              value={maxReviewsPerDay}
              onDecrement={() => adjustReviews(-1)}
              onIncrement={() => adjustReviews(1)}
              decrementDisabled={maxReviewsPerDay <= REVIEWS_STEP}
              disabled={disabled}
              hint={<div className={fieldHint}>A hard cap on how many due cards you&apos;ll see in one session.</div>}
            />
          </GlassCard>
        </>
      )}

      {/* Always visible, even on the kana track (where the level range doesn't apply yet) --
          disabling the level buttons themselves communicates that instead of the whole card
          popping in and out whenever the track switches. */}
      <GlassCard padding="lg" className="mb-5.5">
        <label className={`${fieldLabel} mb-3.5`}>Enabled JLPT levels</label>
        <LevelGrid value={level} onChange={handleLevelChange} cascade={floor} size="sm" disabled={disabled || studyTrack === "kana"} />
        <div className={fieldHint}>Studying {includedLevels.slice().reverse().join(", ")}.</div>

        {/* N5 is the lowest JLPT level -- with nothing below it to include, this toggle
            (and the stepper below it) would have nothing to do. Always mounted (rather than
            conditionally rendered) and animated via the grid-rows trick so it opens/closes
            smoothly instead of popping in and out. */}
        <div
          className={`grid overflow-hidden transition-[grid-template-rows,opacity,margin-top] duration-300 ease-out ${
            level !== "N5" ? "mt-5 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="flex items-center justify-between gap-5 border-t border-border-soft pt-4">
              <div>
                <div className="mb-0.5 text-[0.95rem] font-bold">Also study lower levels</div>
                <div className="text-sm text-text-muted">
                  Include new and review cards from levels below {level} too. Your progress on lower-level cards is kept
                  either way.
                </div>
              </div>
              <Toggle checked={floor !== level} onChange={toggleLowerLevels} disabled={disabled || studyTrack === "kana"} />
            </div>
          </div>
        </div>

        {/* With N4 selected, N5 is the only level below it -- "on" already pins floor there, so
            there's no actual range left to pick from and the stepper would just be a redundant
            way to flip the toggle back off. Only worth showing once there are 2+ levels below
            (level's index > 1) to actually choose among. Same always-mounted grid-rows animation
            as the toggle above. */}
        <div
          className={`grid overflow-hidden transition-[grid-template-rows,opacity,margin-top] duration-300 ease-out ${
            floor !== level && JLPT_LEVELS.indexOf(level) > 1
              ? "mt-4 grid-rows-[1fr] opacity-100"
              : "mt-0 grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="min-h-0 overflow-hidden">
            <div className="flex items-center justify-between gap-5 border-t border-border-soft pt-4">
              <div>
                <div className="mb-0.5 text-[0.95rem] font-bold">Lowest level to include</div>
                <div className="text-sm text-text-muted">You&apos;ll study everything from here up to your current level.</div>
              </div>
              <div className="flex shrink-0 items-center gap-2.5">
                <button
                  type="button"
                  className={stepperButtonClass}
                  onClick={() => adjustFloor(-1)}
                  disabled={disabled || studyTrack === "kana" || JLPT_LEVELS.indexOf(floor) <= 0}
                >
                  <FaMinus />
                </button>
                <span className={stepperValueClass}>{floor}</span>
                <button
                  type="button"
                  className={stepperButtonClass}
                  onClick={() => adjustFloor(1)}
                  disabled={disabled || studyTrack === "kana" || JLPT_LEVELS.indexOf(floor) >= JLPT_LEVELS.indexOf(level)}
                >
                  <FaPlus />
                </button>
              </div>
            </div>
          </div>
        </div>
      </GlassCard>

      <GlassCard padding="lg">
        <div className="border-b border-border-soft py-4 last:border-b-0">
          <div className="flex items-center justify-between gap-5">
            <div>
              <div className="mb-0.5 text-[0.95rem] font-bold">Study hiragana</div>
              <div className="text-sm text-text-muted">Include hiragana reading cards in your queue.</div>
            </div>
            <Toggle checked={studyHiragana} onChange={toggleStudyHiragana} disabled={disabled || (studyHiragana && !studyKatakana)} />
          </div>
          <div
            className={`grid overflow-hidden transition-[grid-template-rows,opacity,margin-top] duration-300 ease-out ${
              hiraganaMessage ? "mt-2.5 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"
            }`}
          >
            <div className="min-h-0 overflow-hidden text-xs text-amber-400">{hiraganaMessage}</div>
          </div>
        </div>
        <div className="border-b border-border-soft py-4 last:border-b-0">
          <div className="flex items-center justify-between gap-5">
            <div>
              <div className="mb-0.5 text-[0.95rem] font-bold">Study katakana</div>
              <div className="text-sm text-text-muted">Include katakana reading cards in your queue.</div>
            </div>
            <Toggle
              checked={studyKatakana && Boolean(hiraganaMastered)}
              onChange={toggleStudyKatakana}
              disabled={disabled || (studyKatakana && !studyHiragana) || !hiraganaMastered}
            />
          </div>
          <div
            className={`grid overflow-hidden transition-[grid-template-rows,opacity,margin-top] duration-300 ease-out ${
              katakanaMessage ? "mt-2.5 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"
            }`}
          >
            <div className="min-h-0 overflow-hidden text-xs text-amber-400">{katakanaMessage}</div>
          </div>
        </div>
        <div className="border-b border-border-soft py-4 last:border-b-0">
          <div className="flex items-center justify-between gap-5">
            <div>
              <div className="mb-0.5 text-[0.95rem] font-bold">Study kanji</div>
              <div className="text-sm text-text-muted">Include kanji meaning &amp; word reading cards in your queue.</div>
            </div>
            <Toggle checked={studyKanji} onChange={toggleStudyKanji} disabled={disabled || (studyKanji && !studyVocabulary)} />
          </div>
          <div
            className={`grid overflow-hidden transition-[grid-template-rows,opacity,margin-top] duration-300 ease-out ${
              kanjiMessage ? "mt-2.5 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"
            }`}
          >
            <div className="min-h-0 overflow-hidden text-xs text-amber-400">{kanjiMessage}</div>
          </div>
        </div>
        <div className="border-b border-border-soft py-4 last:border-b-0">
          <div className="flex items-center justify-between gap-5">
            <div>
              <div className="mb-0.5 text-[0.95rem] font-bold">Study vocabulary</div>
              <div className="text-sm text-text-muted">Include vocabulary meaning cards in your queue.</div>
            </div>
            <Toggle checked={studyVocabulary} onChange={toggleStudyVocabulary} disabled={disabled || (studyVocabulary && !studyKanji)} />
          </div>
          <div
            className={`grid overflow-hidden transition-[grid-template-rows,opacity,margin-top] duration-300 ease-out ${
              vocabularyMessage ? "mt-2.5 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"
            }`}
          >
            <div className="min-h-0 overflow-hidden text-xs text-amber-400">{vocabularyMessage}</div>
          </div>
        </div>
      </GlassCard>

      <GlassCard padding="lg" className="mt-5.5">
        <div className="flex items-center justify-between gap-5 py-1">
          <div>
            <div className="mb-0.5 text-[0.95rem] font-bold">Appear anonymously on leaderboard</div>
            <div className="text-sm text-text-muted">
              Your rank stays visible, but with a random name, no photo, and no country flag.
            </div>
          </div>
          <Toggle checked={leaderboardAnonymous} onChange={() => setLeaderboardAnonymous(!leaderboardAnonymous)} disabled={disabled} />
        </div>

        {leaderboardAnonymous ? (
          <div className="mt-5 flex items-center justify-between gap-5 border-t border-border-soft pt-4">
            <div>
              <div className="mb-0.5 text-sm font-bold uppercase tracking-[0.6px] text-text-muted">
                Your random name
              </div>
              <div className="text-[1.05rem] font-extrabold">
                {leaderboardAlias ? `${leaderboardAlias.adjective} ${leaderboardAlias.noun}` : "…"}
              </div>
            </div>
            <LeaderboardAliasDice onReroll={handleReroll} disabled={disabled || !leaderboardAlias} />
          </div>
        ) : null}
      </GlassCard>
    </div>
  );
}
