"use client";

import { useRef } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { fetchKanjiWordVocabulary } from "@/lib/data/adminKanjiWords";
import { Modal } from "@/app/components/ui/Modal";
import type { KanjiWordCandidate, VocabularyReviewResult, VocabularyUpdateResult } from "@/lib/types";
import { useWordEditor } from "./useWordEditor";
import {
  WordDragExtras,
  WordFooter,
  WordHeading,
  WordHistoryView,
  WordLoadState,
  WordMeaningsFields,
  WordReadingGroup,
  WordUsageGroup,
} from "./WordEditor";

interface WordDetailsModalProps {
  candidate: KanjiWordCandidate;
  onClose: () => void;
  /** A save, an undo or a restore changed the word (on both regions). */
  onSaved: (result: VocabularyUpdateResult) => void;
  /** The word was marked as reviewed, or the mark was taken away (on both regions). */
  onReviewed: (result: VocabularyReviewResult) => void;
}

/**
 * Edit one candidate word's dictionary data in a popup (the pencil on a word card). Everything it does is
 * useWordEditor's; the word page of /admin/words shows the same editor in two columns.
 */
export function WordDetailsModal({ candidate: c, onClose, onSaved, onReviewed }: WordDetailsModalProps) {
  // The scroll box, which dragging scrolls near its edges.
  const scrollRef = useRef<HTMLDivElement>(null);
  const editor = useWordEditor({
    wordKey: c.id,
    load: () => fetchKanjiWordVocabulary(createClient(), c.id).then((vocabulary) => ({ vocabulary })),
    initialReviewed: c.reviewed ?? null,
    rootRef: scrollRef,
    onSaved,
    onReviewed,
  });
  const word = editor.loaded?.word ?? c.word;

  // Portalled: the editor is a GlassCard, whose backdrop-filter would make the Modal's fixed backdrop cover just
  // the card instead of the whole screen.
  return createPortal(
    <Modal
      onClose={onClose}
      labelledBy="word-details-title"
      showCloseButton
      wide
      confirmClose={() => !editor.dirty || window.confirm(`Drop your unsaved changes to ${word}?`)}
    >
      {/* -m-1 p-1: room inside the scroll box for the outline of a changed badge, short meaning or toggle, which
          would be clipped at its edges; the content stays where it was. -mr-7: the box reaches the card's right edge,
          so its scrollbar runs along that edge, clear of the Modal's "x" (16px to 52px in), not under it. pr-13 with
          the scrollbar's room always kept: the content ends 10px left of the "x", so nothing scrolls under it. */}
      <div
        ref={scrollRef}
        className="-m-1 -mr-7 max-h-[calc(100dvh-11rem)] overflow-y-auto p-1 pr-13 text-left [scrollbar-gutter:stable]"
      >
        <WordHeading editor={editor} fallback={{ word: c.word, furiganas: c.furiganas, jlpt: c.jlpt }} id="word-details-title" />
        <WordLoadState editor={editor} />
        <WordHistoryView editor={editor} />
        <WordMeaningsFields editor={editor} />
        <WordReadingGroup editor={editor} />
        <WordUsageGroup editor={editor} />
      </div>

      {/* Over the top of the popup while a meaning or a sense is dragged and S and P are scrolled out of view. */}
      <WordDragExtras editor={editor} />
      <WordFooter editor={editor} className="mt-4 border-t border-border-soft pt-4" />
    </Modal>,
    document.body
  );
}
