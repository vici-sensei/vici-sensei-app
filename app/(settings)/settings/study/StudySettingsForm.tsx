"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LevelGrid, enabledLevelsFor, mostAdvancedLevel } from "@/app/components/ui/LevelGrid";
import { apiPatch, ApiError } from "@/lib/api/client";
import { useToast } from "@/app/components/ui/Toast";
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

  return (
    <div>
      <h2 className="main-title" style={{ fontSize: "1.7rem" }}>
        Study settings
      </h2>
      <p className="subtitle" style={{ marginBottom: 26 }}>
        Control how many new cards you see per day and which JLPT levels are active.
      </p>

      <div className="legal-company-card">
        <div className="field-group">
          <label className="field-label">New kanji per day</label>
          <div className="stepper-row">
            <button type="button" className="stepper-btn" onClick={() => adjustKanji(-1)} disabled={newKanjiPerDay <= 0}>
              −
            </button>
            <span className="stepper-val">{newKanjiPerDay}</span>
            <button type="button" className="stepper-btn" onClick={() => adjustKanji(1)}>
              +
            </button>
          </div>
          <div className="linked-note">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3" />
            </svg>
            Linked 1:6 with new vocabulary — changing one updates the other.
          </div>
        </div>
        <div className="field-group" style={{ marginBottom: 0 }}>
          <label className="field-label">New vocabulary per day</label>
          <div className="stepper-row">
            <button type="button" className="stepper-btn" onClick={() => adjustVocab(-1)} disabled={newVocabPerDay <= 0}>
              −
            </button>
            <span className="stepper-val">{newVocabPerDay}</span>
            <button type="button" className="stepper-btn" onClick={() => adjustVocab(1)}>
              +
            </button>
          </div>
        </div>
      </div>

      <div className="legal-company-card">
        <div className="field-group" style={{ marginBottom: 0 }}>
          <label className="field-label">Max reviews per day</label>
          <div className="stepper-row">
            <button type="button" className="stepper-btn" onClick={() => adjustReviews(-1)} disabled={maxReviewsPerDay <= 0}>
              −
            </button>
            <span className="stepper-val">{maxReviewsPerDay}</span>
            <button type="button" className="stepper-btn" onClick={() => adjustReviews(1)}>
              +
            </button>
          </div>
          <div className="field-hint">A hard cap on how many due cards you&apos;ll see in one session.</div>
        </div>
      </div>

      <div className="legal-company-card">
        <label className="field-label" style={{ marginBottom: 14, display: "block" }}>
          Enabled JLPT levels
        </label>
        <LevelGrid value={level} onChange={handleLevelChange} size="sm" />
        <div className="field-hint">
          Studying {includedLevels.slice().reverse().join(", ")}. Levels normalize automatically — picking a higher
          level enables the ones below it.
        </div>
      </div>

      <div className="legal-company-card">
        <div className="toggle-row">
          <div className="toggle-text">
            <div className="t-title">Study kanji</div>
            <div className="t-desc">Include kanji meaning &amp; reading cards in your queue.</div>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={studyKanji}
              onChange={toggleStudyKanji}
              disabled={studyKanji && !studyVocabulary}
            />
            <span className="switch-track" />
          </label>
        </div>
        <div className="toggle-row">
          <div className="toggle-text">
            <div className="t-title">Study vocabulary</div>
            <div className="t-desc">Include vocabulary meaning cards in your queue.</div>
          </div>
          <label className="switch">
            <input
              type="checkbox"
              checked={studyVocabulary}
              onChange={toggleStudyVocabulary}
              disabled={studyVocabulary && !studyKanji}
            />
            <span className="switch-track" />
          </label>
        </div>
        <div className="field-hint" style={{ marginTop: 10 }}>
          At least one must stay on — you can&apos;t disable both.
        </div>
      </div>

      {error && (
        <p className="field-hint" style={{ color: "var(--color-accent-red)" }}>
          {error}
        </p>
      )}

      <div className="save-bar">
        <div className={`unsaved-note${dirty ? " show" : ""}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Unsaved changes
        </div>
        <button type="button" className="btn-primary" onClick={handleSave} disabled={saving || !dirty}>
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </div>
  );
}
