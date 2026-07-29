"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LevelGrid, enabledLevelsFor, mostAdvancedLevel } from "@/app/components/ui/LevelGrid";
import { apiPatch, ApiError } from "@/lib/api/client";
import { useToast } from "@/app/components/ui/Toast";
import { Button } from "@/app/components/ui/Button";
import type { StudySettings, StudySettingsPatch } from "@/lib/types";
import type { JlptLevel } from "@/lib/srs/constants";

const REVIEWS_STEP = 10;

export function StudySettingsForm({ initial }: { initial: StudySettings }) {
  const router = useRouter();
  const { showToast } = useToast();

  const [newKanjiPerDay, setNewKanjiPerDay] = useState(initial.new_kanji_per_day);
  const [newVocabPerDay, setNewVocabPerDay] = useState(initial.new_vocab_per_day);
  const [maxReviewsPerDay, setMaxReviewsPerDay] = useState(initial.max_reviews_per_day);
  const [level, setLevel] = useState<JlptLevel>(mostAdvancedLevel(initial.enabled_levels));
  const [studyKanji, setStudyKanji] = useState(initial.study_kanji);
  const [studyVocabulary, setStudyVocabulary] = useState(initial.study_vocabulary);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function adjustKanji(delta: number) {
    const next = Math.max(0, newKanjiPerDay + delta);
    setNewKanjiPerDay(next);
    setNewVocabPerDay(next * 6);
    setDirty(true);
  }

  function adjustVocab(delta: number) {
    const next = Math.max(0, newVocabPerDay + delta * 6);
    setNewVocabPerDay(next);
    setNewKanjiPerDay(Math.round(next / 6));
    setDirty(true);
  }

  function adjustReviews(delta: number) {
    setMaxReviewsPerDay((v) => Math.max(0, v + delta * REVIEWS_STEP));
    setDirty(true);
  }

  function handleLevelChange(next: JlptLevel) {
    setLevel(next);
    setDirty(true);
  }

  function toggleStudyKanji() {
    if (studyKanji && !studyVocabulary) return;
    setStudyKanji(!studyKanji);
    setDirty(true);
  }

  function toggleStudyVocabulary() {
    if (studyVocabulary && !studyKanji) return;
    setStudyVocabulary(!studyVocabulary);
    setDirty(true);
  }

  async function handleSave() {
    setSaving(true);
    setError(null);
    const body: StudySettingsPatch = {
      new_kanji_per_day: newKanjiPerDay,
      new_vocab_per_day: newVocabPerDay,
      max_reviews_per_day: maxReviewsPerDay,
      enabled_levels: enabledLevelsFor(level),
      study_kanji: studyKanji,
      study_vocabulary: studyVocabulary,
    };
    try {
      await apiPatch<StudySettings>("/api/study-settings", body);
      setDirty(false);
      showToast("Study settings saved");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save your settings.");
    } finally {
      setSaving(false);
    }
  }

  const includedLevels = enabledLevelsFor(level);

  const fieldLabel = "mb-2 block text-sm font-bold uppercase tracking-[0.6px] text-text-muted";
  const fieldHint = "mt-1.5 text-[0.8rem] leading-normal text-text-muted";
  const stepperBtn =
    "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border-soft bg-white/[0.04] text-xl font-bold text-white enabled:hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40";
  const stepperVal = "w-15 text-center text-[1.05rem] font-extrabold tabular-nums";

  return (
    <div>
      <h2 className="main-title text-[1.7rem]">Study settings</h2>
      <p className="subtitle mb-6.5">Control how many new cards you see per day and which JLPT levels are active.</p>

      <div className="mb-5.5 rounded-2xl border border-border-soft bg-bg-cards px-8 py-[30px] backdrop-blur-[10px]">
        <div className="mb-[22px]">
          <label className={fieldLabel}>New kanji per day</label>
          <div className="flex items-center gap-2.5">
            <button type="button" className={stepperBtn} onClick={() => adjustKanji(-1)} disabled={newKanjiPerDay <= 0}>
              −
            </button>
            <span className={stepperVal}>{newKanjiPerDay}</span>
            <button type="button" className={stepperBtn} onClick={() => adjustKanji(1)}>
              +
            </button>
          </div>
          <div className="mt-2.5 flex items-center gap-2 text-sm text-accent-blue [&>svg]:h-3.5 [&>svg]:w-3.5 [&>svg]:shrink-0">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
            Linked 1:6 with new vocabulary — changing one updates the other.
          </div>
        </div>
        <div>
          <label className={fieldLabel}>New vocabulary per day</label>
          <div className="flex items-center gap-2.5">
            <button type="button" className={stepperBtn} onClick={() => adjustVocab(-1)} disabled={newVocabPerDay <= 0}>
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
            <button type="button" className={stepperBtn} onClick={() => adjustReviews(-1)} disabled={maxReviewsPerDay <= 0}>
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
        <LevelGrid value={level} onChange={handleLevelChange} size="sm" />
        <div className={fieldHint}>
          Studying {includedLevels.slice().reverse().join(", ")}. Levels normalize automatically — picking a higher
          level enables the ones below it.
        </div>
      </div>

      <div className="mb-5.5 rounded-2xl border border-border-soft bg-bg-cards px-8 py-[30px] backdrop-blur-[10px]">
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

      {error && <p className="mt-1.5 text-[0.8rem] leading-normal text-accent-red">{error}</p>}

      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-border-soft pt-[22px]">
        <div
          className={`flex items-center gap-2 text-[0.85rem] text-accent-gold transition-opacity duration-200 [&>svg]:h-3.5 [&>svg]:w-3.5 ${
            dirty ? "opacity-100" : "opacity-0"
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Unsaved changes
        </div>
        <Button onClick={handleSave} disabled={saving || !dirty}>
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
