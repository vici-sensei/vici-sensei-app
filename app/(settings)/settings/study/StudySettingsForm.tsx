"use client";

import { useEffect, useState } from "react";
import { LevelGrid, enabledLevelsFor, mostAdvancedLevel } from "@/app/components/ui/LevelGrid";
import { ApiError } from "@/lib/api/client";
import { useAuth } from "@/lib/auth/AuthProvider";
import { updateStudySettings } from "@/lib/client-data/studySettings";
import { useToast } from "@/app/components/ui/Toast";
import type { StudySettings, StudySettingsPatch } from "@/lib/types";
import type { JlptLevel } from "@/lib/srs/constants";
import { FaLink } from "react-icons/fa6";

const REVIEWS_STEP = 10;
const AUTOSAVE_DELAY_MS = 500;

type Snapshot = {
  newKanjiPerDay: number;
  newVocabPerDay: number;
  maxReviewsPerDay: number;
  level: JlptLevel;
  studyKanji: boolean;
  studyVocabulary: boolean;
};

function snapshotFrom(settings: StudySettings): Snapshot {
  return {
    newKanjiPerDay: settings.new_kanji_per_day,
    newVocabPerDay: settings.new_vocab_per_day,
    maxReviewsPerDay: settings.max_reviews_per_day,
    level: mostAdvancedLevel(settings.enabled_levels),
    studyKanji: settings.study_kanji,
    studyVocabulary: settings.study_vocabulary,
  };
}

function sameSnapshot(a: Snapshot, b: Snapshot): boolean {
  return (
    a.newKanjiPerDay === b.newKanjiPerDay &&
    a.newVocabPerDay === b.newVocabPerDay &&
    a.maxReviewsPerDay === b.maxReviewsPerDay &&
    a.level === b.level &&
    a.studyKanji === b.studyKanji &&
    a.studyVocabulary === b.studyVocabulary
  );
}

export function StudySettingsForm({ initial, onSaved }: { initial: StudySettings; onSaved: () => void }) {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [newKanjiPerDay, setNewKanjiPerDay] = useState(initial.new_kanji_per_day);
  const [newVocabPerDay, setNewVocabPerDay] = useState(initial.new_vocab_per_day);
  const [maxReviewsPerDay, setMaxReviewsPerDay] = useState(initial.max_reviews_per_day);
  const [level, setLevel] = useState<JlptLevel>(mostAdvancedLevel(initial.enabled_levels));
  const [studyKanji, setStudyKanji] = useState(initial.study_kanji);
  const [studyVocabulary, setStudyVocabulary] = useState(initial.study_vocabulary);
  const [saved, setSaved] = useState<Snapshot>(() => snapshotFrom(initial));

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
    setStudyKanji(snapshot.studyKanji);
    setStudyVocabulary(snapshot.studyVocabulary);
  }

  // Autosave a beat after the user stops adjusting settings, batching rapid
  // changes (e.g. several stepper clicks) into a single combined PATCH — the
  // save is atomic (one row update), so a failure reverts every field at once
  // rather than guessing which individual change caused it.
  useEffect(() => {
    if (!user) return;
    const current: Snapshot = { newKanjiPerDay, newVocabPerDay, maxReviewsPerDay, level, studyKanji, studyVocabulary };
    if (sameSnapshot(current, saved)) return;

    const timeout = setTimeout(async () => {
      const body: StudySettingsPatch = {
        new_kanji_per_day: current.newKanjiPerDay,
        new_vocab_per_day: current.newVocabPerDay,
        max_reviews_per_day: current.maxReviewsPerDay,
        enabled_levels: enabledLevelsFor(current.level),
        study_kanji: current.studyKanji,
        study_vocabulary: current.studyVocabulary,
      };
      try {
        await updateStudySettings(user.id, body);
        setSaved(current);
        onSaved();
      } catch (err) {
        showToast(err instanceof ApiError ? err.message : "Could not save your settings.", "error");
        revertTo(saved);
      }
    }, AUTOSAVE_DELAY_MS);

    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- revertTo/onSaved/showToast close over stable state each render
  }, [newKanjiPerDay, newVocabPerDay, maxReviewsPerDay, level, studyKanji, studyVocabulary, saved, user]);

  const includedLevels = enabledLevelsFor(level);

  const fieldLabel = "mb-2 block text-sm font-bold uppercase tracking-[0.6px] text-text-muted";
  const fieldHint = "mt-1.5 text-[0.8rem] leading-normal text-text-muted";
  const stepperBtn =
    "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border-soft bg-white/[0.04] text-xl font-bold text-white enabled:hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40";
  const stepperVal = "w-15 text-center text-[1.05rem] font-extrabold tabular-nums";

  return (
    <div>
      <h2 className="mb-2 text-[1.7rem] font-extrabold leading-[1.2] tracking-[-0.8px]">Study settings</h2>
      <p className="mb-6.5 text-base leading-[1.6] text-text-muted">
        Control how many new cards you see per day and which JLPT levels are active.
      </p>

      <div className="mb-5.5 rounded-2xl border border-border-soft bg-bg-cards px-8 py-[30px] backdrop-blur-[10px]">
        <div className="mb-[22px]">
          <label className={fieldLabel}>New kanji per day</label>
          <div className="flex items-center gap-2.5">
            <button type="button" className={stepperBtn} onClick={() => adjustKanji(-1)} disabled={newKanjiPerDay <= 1}>
              −
            </button>
            <span className={stepperVal}>{newKanjiPerDay}</span>
            <button type="button" className={stepperBtn} onClick={() => adjustKanji(1)}>
              +
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
            <button type="button" className={stepperBtn} onClick={() => adjustVocab(-1)} disabled={newVocabPerDay <= 6}>
              −
            </button>
            <span className={stepperVal}>{newVocabPerDay}</span>
            <button type="button" className={stepperBtn} onClick={() => adjustVocab(1)}>
              +
            </button>
          </div>
        </div>
      </div>

      <div className="mb-5.5 rounded-2xl border border-border-soft bg-bg-cards px-8 py-[30px] backdrop-blur-[10px]">
        <div>
          <label className={fieldLabel}>Max reviews per day</label>
          <div className="flex items-center gap-2.5">
            <button type="button" className={stepperBtn} onClick={() => adjustReviews(-1)} disabled={maxReviewsPerDay <= REVIEWS_STEP}>
              −
            </button>
            <span className={stepperVal}>{maxReviewsPerDay}</span>
            <button type="button" className={stepperBtn} onClick={() => adjustReviews(1)}>
              +
            </button>
          </div>
          <div className={fieldHint}>A hard cap on how many due cards you&apos;ll see in one session.</div>
        </div>
      </div>

      <div className="mb-5.5 rounded-2xl border border-border-soft bg-bg-cards px-8 py-[30px] backdrop-blur-[10px]">
        <label className={`${fieldLabel} mb-3.5`}>Enabled JLPT levels</label>
        <LevelGrid value={level} onChange={setLevel} size="sm" />
        <div className={fieldHint}>
          Studying {includedLevels.slice().reverse().join(", ")}. Levels normalize automatically — picking a higher
          level enables the ones below it.
        </div>
      </div>

      <div className="rounded-2xl border border-border-soft bg-bg-cards px-8 py-[30px] backdrop-blur-[10px]">
        <div className="flex items-center justify-between gap-5 border-b border-border-soft py-4 last:border-b-0">
          <div>
            <div className="mb-0.5 text-[0.95rem] font-bold">Study kanji</div>
            <div className="text-sm text-text-muted">Include kanji meaning &amp; reading cards in your queue.</div>
          </div>
          <label className="relative h-[26px] w-[46px] shrink-0">
            <input
              type="checkbox"
              className="peer h-0 w-0 opacity-0"
              checked={studyKanji}
              onChange={toggleStudyKanji}
              disabled={studyKanji && !studyVocabulary}
            />
            <span className="absolute inset-0 cursor-pointer rounded-full bg-white/10 transition-colors duration-200 before:absolute before:left-[3px] before:top-[3px] before:h-5 before:w-5 before:rounded-full before:bg-white before:transition-transform before:duration-200 peer-checked:bg-accent-red peer-checked:before:translate-x-5 peer-disabled:cursor-not-allowed peer-disabled:opacity-40" />
          </label>
        </div>
        <div className="flex items-center justify-between gap-5 border-b border-border-soft py-4 last:border-b-0">
          <div>
            <div className="mb-0.5 text-[0.95rem] font-bold">Study vocabulary</div>
            <div className="text-sm text-text-muted">Include vocabulary meaning cards in your queue.</div>
          </div>
          <label className="relative h-[26px] w-[46px] shrink-0">
            <input
              type="checkbox"
              className="peer h-0 w-0 opacity-0"
              checked={studyVocabulary}
              onChange={toggleStudyVocabulary}
              disabled={studyVocabulary && !studyKanji}
            />
            <span className="absolute inset-0 cursor-pointer rounded-full bg-white/10 transition-colors duration-200 before:absolute before:left-[3px] before:top-[3px] before:h-5 before:w-5 before:rounded-full before:bg-white before:transition-transform before:duration-200 peer-checked:bg-accent-red peer-checked:before:translate-x-5 peer-disabled:cursor-not-allowed peer-disabled:opacity-40" />
          </label>
        </div>
        <div className={`${fieldHint} mt-2.5`}>At least one must stay on — you can&apos;t disable both.</div>
      </div>
    </div>
  );
}
