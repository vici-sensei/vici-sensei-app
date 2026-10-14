"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { describeKanjiWordsError, fetchKanjiWordVocabulary } from "@/lib/data/adminKanjiWords";
import { renderWordWithFurigana } from "@/lib/study/furigana";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { Modal } from "@/app/components/ui/Modal";
import { Skeleton } from "@/app/components/ui/Skeleton";
import type { KanjiWordCandidate, KanjiWordVocabulary } from "@/lib/types";
import { candidateMeanings, WordMeanings } from "./WordMeanings";

function listText(items: string[] | null, separator = ", "): string {
  return items && items.length > 0 ? items.join(separator) : "—";
}

function yesNo(value: boolean | null): string {
  return value ? "Yes" : "No";
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5 border-t border-border-soft pt-4">
      <h4 className="mb-2.5 text-[0.7rem] font-extrabold uppercase tracking-[1px] text-text-muted">{title}</h4>
      {/* Label beside its value, the same label column in every group; on a phone the label sits above the value. */}
      <dl className="grid grid-cols-1 text-sm sm:grid-cols-[10rem_1fr] sm:gap-x-4 sm:gap-y-1.5">{children}</dl>
    </section>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-xs text-text-muted sm:text-sm">{label}</dt>
      <dd className="mb-2 min-w-0 break-words last:mb-0 sm:mb-0">{children}</dd>
    </>
  );
}

interface WordDetailsModalProps {
  candidate: KanjiWordCandidate;
  onClose: () => void;
}

/** One candidate word's dictionary data: its JLPT level, how it is written (with its furigana), what it means,
 *  how it is read, how it is used. */
export function WordDetailsModal({ candidate: c, onClose }: WordDetailsModalProps) {
  const [vocabulary, setVocabulary] = useState<KanjiWordVocabulary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchKanjiWordVocabulary(createClient(), c.id)
      .then((v) => {
        if (cancelled) return;
        setVocabulary(v);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(describeKanjiWordsError(err, "Couldn't load this word."));
      });
    return () => {
      cancelled = true;
    };
  }, [c.id, retryTick]);

  const v = vocabulary;

  // Portalled: the editor is a GlassCard, whose backdrop-filter would make the Modal's fixed backdrop cover just
  // the card instead of the whole screen.
  return createPortal(
    <Modal onClose={onClose} labelledBy="word-details-title" showCloseButton wide>
      <div className="max-h-[calc(100dvh-7rem)] overflow-y-auto pr-1 text-left">
        {/* The candidate already knows the level, so the badge shows before the row arrives. A word without one
            gets the badge's grey look. */}
        <LevelBadge level={(v ? v.jlpt_level : c.jlpt) ?? "No level"} />
        <h3 id="word-details-title" className="mt-1 pr-10 text-[2.2rem] font-bold leading-[1.9]">
          {renderWordWithFurigana(v?.word ?? c.word, v ? v.furiganas : c.furiganas, "text-[0.8rem] font-normal text-text-muted")}
        </h3>
        {/* The meaning, right under the word, unlabelled; the candidate's own copy until the row arrives. */}
        <WordMeanings
          {...(v
            ? { short: v.short_meaning?.trim() || null, primary: v.primary_meanings ?? [], other: v.other_meanings ?? [] }
            : candidateMeanings(c))}
        />

        {error ? (
          <div className="mt-4 text-sm">
            <p className="text-text-muted">{error}</p>
            <button
              type="button"
              onClick={() => {
                setError(null);
                setRetryTick((tick) => tick + 1);
              }}
              className="mt-2 cursor-pointer font-bold text-accent-blue hover:underline"
            >
              Try again
            </button>
          </div>
        ) : null}

        {!v && !error ? (
          <div className="mt-5 space-y-2.5">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-4 w-3/5" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : null}

        {v ? (
          <>
            <Group title="Reading">
              <Field label="Kana reading">{v.kana_reading || "—"}</Field>
              <Field label="Romaji">{v.romaji_reading || "—"}</Field>
              <Field label="Furigana">{listText(v.furiganas, " · ")}</Field>
              <Field label="Romaji furigana">{listText(v.romaji_furiganas, " · ")}</Field>
              <Field label="Other readings">{listText(v.other_readings)}</Field>
            </Group>

            <Group title="Usage">
              <Field label="Parts of speech">{listText(v.parts_of_speech)}</Field>
              <Field label="Common (Jisho)">{yesNo(v.is_common_jisho)}</Field>
              <Field label="Usually written in kana">{yesNo(v.usually_kana)}</Field>
              <Field label="Enabled for study">{yesNo(v.study_enabled)}</Field>
            </Group>
          </>
        ) : null}
      </div>
    </Modal>,
    document.body
  );
}
