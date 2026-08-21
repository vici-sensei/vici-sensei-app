"use client";

import { useEffect, useState } from "react";
import { LevelGrid } from "@/app/components/ui/LevelGrid";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { Toggle } from "@/app/components/ui/Toggle";
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
const AUTOSAVE_DELAY_MS = 500;

type Snapshot = {
  newKanjiPerDay: number;
  newVocabPerDay: number;
  maxReviewsPerDay: number;
  level: JlptLevel;
  floor: JlptLevel;
  studyKanji: boolean;
  studyVocabulary: boolean;
  leaderboardAnonymous: boolean;
};

function snapshotFrom(settings: StudySettings): Snapshot {
  return {
    newKanjiPerDay: settings.new_kanji_per_day,
    newVocabPerDay: settings.new_vocab_per_day,
    maxReviewsPerDay: settings.max_reviews_per_day,
    level: mostAdvancedLevel(settings.enabled_levels),
    floor: leastAdvancedLevel(settings.enabled_levels),
    studyKanji: settings.study_kanji,
    studyVocabulary: settings.study_vocabulary,
    leaderboardAnonymous: settings.leaderboard_anonymous ?? false,
  };
}

function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  return (
    a.newKanjiPerDay === b.newKanjiPerDay &&
    a.newVocabPerDay === b.newVocabPerDay &&
    a.maxReviewsPerDay === b.maxReviewsPerDay &&
    a.level === b.level &&
    a.floor === b.floor &&
    a.studyKanji === b.studyKanji &&
    a.studyVocabulary === b.studyVocabulary &&
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
  const [maxReviewsPerDay, setMaxReviewsPerDay] = useState(initial.max_reviews_per_day);
  const [level, setLevel] = useState<JlptLevel>(mostAdvancedLevel(initial.enabled_levels));
  const [floor, setFloor] = useState<JlptLevel>(leastAdvancedLevel(initial.enabled_levels));
  const [studyKanji, setStudyKanji] = useState(initial.study_kanji);
  const [studyVocabulary, setStudyVocabulary] = useState(initial.study_vocabulary);
  // Coerced to a definite boolean here -- null (onboarding not yet chosen) shouldn't reach this
  // page in practice, since /onboarding gates access before it, but the toggle itself is binary.
  const [leaderboardAnonymous, setLeaderboardAnonymous] = useState(initial.leaderboard_anonymous ?? false);
  const [leaderboardAlias, setLeaderboardAlias] = useState<LeaderboardAlias | null>(initial.leaderboard_alias);
  const [saved, setSaved] = useState<Snapshot>(() => snapshotFrom(initial));

  // A background refetch (any autosave calls onSaved -> refetch) hands us a fresh
  // `initial` — resync the alias from it the same way ProfileSettingsForm resyncs
  // avatarUrl, since the alias can also change server-side (the assignment trigger)
  // independent of whatever patch this component itself just sent.
  useEffect(() => {
    setLeaderboardAlias(initial.leaderboard_alias);
  }, [initial.leaderboard_alias]);

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
    if (studyKanji && !studyVocabulary) return;
    setStudyKanji(!studyKanji);
  }

  function toggleStudyVocabulary() {
    if (studyVocabulary && !studyKanji) return;
    setStudyVocabulary(!studyVocabulary);
  }

  function revertTo(snapshot: Snapshot) {
    setNewKanjiPerDay(snapshot.newKanjiPerDay);
    setNewVocabPerDay(snapshot.newVocabPerDay);
    setMaxReviewsPerDay(snapshot.maxReviewsPerDay);
    setLevel(snapshot.level);
    setFloor(snapshot.floor);
    setStudyKanji(snapshot.studyKanji);
    setStudyVocabulary(snapshot.studyVocabulary);
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

  // Autosave a beat after the user stops adjusting settings, batching rapid
  // changes (e.g. several stepper clicks) into a single combined PATCH — the
  // save is atomic (one row update), so a failure reverts every field at once
  // rather than guessing which individual change caused it.
  useEffect(() => {
    if (!user) return;
    const current: Snapshot = {
      newKanjiPerDay,
      newVocabPerDay,
      maxReviewsPerDay,
      level,
      floor,
      studyKanji,
      studyVocabulary,
      leaderboardAnonymous,
    };
    if (sameSnapshot(current, saved)) return;

    const timeout = setTimeout(async () => {
      const body: StudySettingsPatch = {
        new_kanji_per_day: current.newKanjiPerDay,
        new_vocab_per_day: current.newVocabPerDay,
        max_reviews_per_day: current.maxReviewsPerDay,
        enabled_levels: levelsInRange(current.floor, current.level),
        include_lower_levels: current.floor !== current.level,
        study_kanji: current.studyKanji,
        study_vocabulary: current.studyVocabulary,
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
    maxReviewsPerDay,
    level,
    floor,
    studyKanji,
    studyVocabulary,
    leaderboardAnonymous,
    saved,
    user,
  ]);

  const includedLevels = levelsInRange(floor, level);

  const stepperBtn =
    "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border-soft bg-white/[0.04] text-white enabled:hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40 [&>svg]:h-3 [&>svg]:w-3";
  const stepperVal = "w-15 text-center text-[1.05rem] font-extrabold tabular-nums";

  return (
    <div>
      <GlassCard padding="lg" className="mb-5.5">
        <div className="mb-[22px]">
          <label className={fieldLabel}>New kanji per day</label>
          <div className="flex items-center gap-2.5">
            <button type="button" className={stepperBtn} onClick={() => adjustKanji(-1)} disabled={disabled || newKanjiPerDay <= 1}>
              <FaMinus />
            </button>
            <span className={stepperVal}>{newKanjiPerDay}</span>
            <button type="button" className={stepperBtn} onClick={() => adjustKanji(1)} disabled={disabled}>
              <FaPlus />
            </button>
          </div>
          <div className="mt-2.5 flex items-center gap-2 text-sm text-accent-blue [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:shrink-0">
            <FaLink />
            Linked 1:6 with new vocabulary — changing one updates the other.
          </div>
        </div>
        <div>
          <label className={fieldLabel}>New vocabulary per day</label>
          <div className="flex items-center gap-2.5">
            <button type="button" className={stepperBtn} onClick={() => adjustVocab(-1)} disabled={disabled || newVocabPerDay <= 6}>
              <FaMinus />
            </button>
            <span className={stepperVal}>{newVocabPerDay}</span>
            <button type="button" className={stepperBtn} onClick={() => adjustVocab(1)} disabled={disabled}>
              <FaPlus />
            </button>
          </div>
        </div>
      </GlassCard>

      <GlassCard padding="lg" className="mb-5.5">
        <div>
          <label className={fieldLabel}>Max reviews per day</label>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              className={stepperBtn}
              onClick={() => adjustReviews(-1)}
              disabled={disabled || maxReviewsPerDay <= REVIEWS_STEP}
            >
              <FaMinus />
            </button>
            <span className={stepperVal}>{maxReviewsPerDay}</span>
            <button type="button" className={stepperBtn} onClick={() => adjustReviews(1)} disabled={disabled}>
              <FaPlus />
            </button>
          </div>
          <div className={fieldHint}>A hard cap on how many due cards you&apos;ll see in one session.</div>
        </div>
      </GlassCard>

      <GlassCard padding="lg" className="mb-5.5">
        <label className={`${fieldLabel} mb-3.5`}>Enabled JLPT levels</label>
        <LevelGrid value={level} onChange={handleLevelChange} cascade={floor} size="sm" disabled={disabled} />
        <div className={fieldHint}>Studying {includedLevels.slice().reverse().join(", ")}.</div>

        <div className="mt-5 flex items-center justify-between gap-5 border-t border-border-soft pt-4">
          <div>
            <div className="mb-0.5 text-[0.95rem] font-bold">Also study lower levels</div>
            <div className="text-sm text-text-muted">
              Include new and review cards from levels below {level} too. Your progress on lower-level cards is kept
              either way.
            </div>
          </div>
          {/* N5 is the lowest JLPT level -- with nothing below it to include, the toggle has
              nothing to do (handleLevelChange already forces floor back to level whenever N5
              is picked, so this only needs to block the otherwise-inert click). */}
          <Toggle checked={floor !== level} onChange={toggleLowerLevels} disabled={disabled || level === "N5"} />
        </div>

        {/* With N4 selected, N5 is the only level below it -- "on" already pins floor there, so
            there's no actual range left to pick from and the stepper would just be a redundant
            way to flip the toggle back off. Only worth showing once there are 2+ levels below
            (level's index > 1) to actually choose among. */}
        {floor !== level && JLPT_LEVELS.indexOf(level) > 1 ? (
          <div className="mt-4 flex items-center justify-between gap-5 border-t border-border-soft pt-4">
            <div>
              <div className="mb-0.5 text-[0.95rem] font-bold">Lowest level to include</div>
              <div className="text-sm text-text-muted">You&apos;ll study everything from here up to your current level.</div>
            </div>
            <div className="flex shrink-0 items-center gap-2.5">
              <button
                type="button"
                className={stepperBtn}
                onClick={() => adjustFloor(-1)}
                disabled={disabled || JLPT_LEVELS.indexOf(floor) <= 0}
              >
                <FaMinus />
              </button>
              <span className={stepperVal}>{floor}</span>
              <button
                type="button"
                className={stepperBtn}
                onClick={() => adjustFloor(1)}
                disabled={disabled || JLPT_LEVELS.indexOf(floor) >= JLPT_LEVELS.indexOf(level)}
              >
                <FaPlus />
              </button>
            </div>
          </div>
        ) : null}
      </GlassCard>

      <GlassCard padding="lg">
        <div className="flex items-center justify-between gap-5 border-b border-border-soft py-4 last:border-b-0">
          <div>
            <div className="mb-0.5 text-[0.95rem] font-bold">Study kanji</div>
            <div className="text-sm text-text-muted">Include kanji meaning &amp; reading cards in your queue.</div>
          </div>
          <Toggle checked={studyKanji} onChange={toggleStudyKanji} disabled={disabled || (studyKanji && !studyVocabulary)} />
        </div>
        <div className="flex items-center justify-between gap-5 border-b border-border-soft py-4 last:border-b-0">
          <div>
            <div className="mb-0.5 text-[0.95rem] font-bold">Study vocabulary</div>
            <div className="text-sm text-text-muted">Include vocabulary meaning cards in your queue.</div>
          </div>
          <Toggle
            checked={studyVocabulary}
            onChange={toggleStudyVocabulary}
            disabled={disabled || (studyVocabulary && !studyKanji)}
          />
        </div>
        <div className={`${fieldHint} mt-2.5`}>At least one must stay on — you can&apos;t disable both.</div>
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
