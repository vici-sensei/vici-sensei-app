"use client";

import { useEffect, useState } from "react";
import { LevelGrid } from "@/app/components/ui/LevelGrid";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { Toggle } from "@/app/components/ui/Toggle";
import { Stepper, stepperButtonClass, stepperValueClass } from "@/app/components/ui/Stepper";
import { fieldLabel, fieldHint } from "@/app/components/ui/formClasses";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { updateStudySettings, rerollLeaderboardAlias } from "@/lib/client-data/studySettings";
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
    void handleCrossTrack({
      study_track: "standard",
      study_kanji: true,
      study_vocabulary: true,
      study_hiragana: false,
      study_katakana: false,
    });
  }

  function toggleStudyVocabulary() {
    if (studyTrack === "standard") {
      if (studyVocabulary && !studyKanji) return;
      setStudyVocabulary(!studyVocabulary);
      return;
    }
    void handleCrossTrack({
      study_track: "standard",
      study_kanji: true,
      study_vocabulary: true,
      study_hiragana: false,
      study_katakana: false,
    });
  }

  function toggleStudyHiragana() {
    if (studyTrack === "kana") {
      if (studyHiragana && !studyKatakana) return;
      setStudyHiragana(!studyHiragana);
      return;
    }
    void handleCrossTrack({
      study_track: "kana",
      study_hiragana: true,
      study_katakana: studyKatakana,
      study_kanji: false,
      study_vocabulary: false,
      // Required alongside study_track by the kana_level_check CHECK constraint -- see
      // handleCrossTrack's comment. Without this, a user who'd picked a level above N5 on the
      // standard track would hit a DB constraint violation crossing over here instead of
      // resetting to N5, same as onboarding's handleKnowsKanaChange does for its "No" branch.
      enabled_levels: ["N5"],
    });
  }

  function toggleStudyKatakana() {
    if (studyTrack === "kana") {
      if (studyKatakana && !studyHiragana) return;
      setStudyKatakana(!studyKatakana);
      return;
    }
    void handleCrossTrack({
      study_track: "kana",
      study_katakana: true,
      study_hiragana: studyHiragana,
      study_kanji: false,
      study_vocabulary: false,
      enabled_levels: ["N5"],
    });
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
  async function handleCrossTrack(patch: StudySettingsPatch) {
    if (!user) return;
    try {
      const updated = await updateStudySettings(user.id, patch);
      setStudyTrack(updated.study_track);
      setStudyKanji(updated.study_kanji);
      setStudyVocabulary(updated.study_vocabulary);
      setStudyHiragana(updated.study_hiragana);
      setStudyKatakana(updated.study_katakana);
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
        <div className="flex items-center justify-between gap-5 border-b border-border-soft py-4 last:border-b-0">
          <div>
            <div className="mb-0.5 text-[0.95rem] font-bold">Study hiragana</div>
            <div className="text-sm text-text-muted">Include hiragana reading cards in your queue.</div>
          </div>
          <Toggle checked={studyHiragana} onChange={toggleStudyHiragana} disabled={disabled || (studyHiragana && !studyKatakana)} />
        </div>
        <div className="flex items-center justify-between gap-5 border-b border-border-soft py-4 last:border-b-0">
          <div>
            <div className="mb-0.5 text-[0.95rem] font-bold">Study katakana</div>
            <div className="text-sm text-text-muted">Include katakana reading cards in your queue.</div>
          </div>
          <Toggle checked={studyKatakana} onChange={toggleStudyKatakana} disabled={disabled || (studyKatakana && !studyHiragana)} />
        </div>
        <div className="flex items-center justify-between gap-5 border-b border-border-soft py-4 last:border-b-0">
          <div>
            <div className="mb-0.5 text-[0.95rem] font-bold">Study kanji</div>
            <div className="text-sm text-text-muted">Include kanji meaning &amp; word reading cards in your queue.</div>
          </div>
          <Toggle checked={studyKanji} onChange={toggleStudyKanji} disabled={disabled || (studyKanji && !studyVocabulary)} />
        </div>
        <div className="flex items-center justify-between gap-5 border-b border-border-soft py-4 last:border-b-0">
          <div>
            <div className="mb-0.5 text-[0.95rem] font-bold">Study vocabulary</div>
            <div className="text-sm text-text-muted">Include vocabulary meaning cards in your queue.</div>
          </div>
          <Toggle checked={studyVocabulary} onChange={toggleStudyVocabulary} disabled={disabled || (studyVocabulary && !studyKanji)} />
        </div>
        <div className={`${fieldHint} mt-2.5`}>Hiragana/Katakana and Kanji/Vocabulary are separate tracks — you're always on one. Switching on the other pair moves you over to it, and at least one toggle in your current pair must stay on.</div>
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
