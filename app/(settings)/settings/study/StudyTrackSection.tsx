"use client";

import { useState } from "react";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { Button } from "@/app/components/ui/Button";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import type { StudyTrack } from "@/lib/types";

export function StudyTrackSection({
  studyTrack,
  onSwitch,
  disabled = false,
}: {
  studyTrack: StudyTrack;
  onSwitch: () => Promise<void>;
  disabled?: boolean;
}) {
  const [confirming, setConfirming] = useState(false);
  const [switching, setSwitching] = useState(false);

  async function handleConfirm() {
    setSwitching(true);
    try {
      await onSwitch();
      setConfirming(false);
    } finally {
      setSwitching(false);
    }
  }

  return (
    <GlassCard padding="lg" className="mb-5.5">
      <label className="mb-2 block text-sm font-bold uppercase tracking-[0.6px] text-text-muted">Study track</label>
      <div className="mb-4 text-sm text-text-muted">
        {studyTrack === "kana"
          ? "You're studying hiragana and katakana."
          : "You're studying kanji and vocabulary."}
      </div>
      <Button type="button" variant="secondary" onClick={() => setConfirming(true)} disabled={disabled}>
        {studyTrack === "kana" ? "I've finished kana, start kanji" : "Resume kana"}
      </Button>

      {confirming && (
        <ConfirmDialog
          title={studyTrack === "kana" ? "Switch to kanji and vocabulary?" : "Switch back to hiragana and katakana?"}
          description={
            studyTrack === "kana"
              ? "Your next study session will show kanji and vocabulary cards instead. Your hiragana and katakana progress is kept, and you can come back to it any time."
              : "Your next study session will show hiragana and katakana cards instead. Your kanji and vocabulary progress is kept, and you can come back to it any time."
          }
          confirmLabel="Switch"
          loading={switching}
          onConfirm={handleConfirm}
          onCancel={() => setConfirming(false)}
        />
      )}
    </GlassCard>
  );
}
