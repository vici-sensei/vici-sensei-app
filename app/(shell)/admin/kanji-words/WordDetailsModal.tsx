"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { createClient } from "@/lib/supabase/client";
import { describeKanjiWordsError, fetchKanjiWordDetails } from "@/lib/data/adminKanjiWords";
import { renderWordWithFurigana } from "@/lib/study/furigana";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { Modal } from "@/app/components/ui/Modal";
import { Skeleton } from "@/app/components/ui/Skeleton";
import type { KanjiWordCandidate, KanjiWordDetails } from "@/lib/types";
import { algoReason } from "./wordLabels";
import { candidateMeanings, WordMeanings } from "./WordMeanings";

// The vocabulary columns with a readable label, in the order they are listed. The meaning columns are shown at
// the top (WordMeanings) and `word` is the title; any column not named here still shows, under its own name.
const VOCABULARY_FIELDS: [column: string, label: string][] = [
  ["id", "Vocabulary id"],
  ["kana_reading", "Kana reading"],
  ["romaji_reading", "Romaji"],
  ["furiganas", "Furigana"],
  ["romaji_furiganas", "Romaji furigana"],
  ["other_readings", "Other readings"],
  ["parts_of_speech", "Parts of speech"],
  ["jlpt_level", "JLPT level"],
  ["is_common_jisho", "Common (Jisho)"],
  ["usually_kana", "Usually written in kana"],
  ["frequency_number", "Frequency number"],
  ["study_enabled", "Enabled for study"],
  ["ids_kanji", "Kanji ids"],
];
const SHOWN_ELSEWHERE = new Set(["word", "short_meaning", "primary_meanings", "other_meanings"]);
// Per-character lists read better apart than glued with commas.
const SEGMENTED = new Set(["furiganas", "romaji_furiganas"]);

const CAND_CLASS = ["Normal word", "Shared furigana (read as a whole)", "Usually written in kana"];

function formatValue(value: unknown, separator = ", "): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    if (value.length === 0) return "—";
    return value.map((item) => (item !== null && typeof item === "object" ? JSON.stringify(item) : String(item))).join(separator);
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function levelsText(gap: number): string {
  if (gap === 0) return "same level as the kanji";
  const n = Math.abs(gap);
  return `${n} level${n === 1 ? "" : "s"} ${gap > 0 ? "above" : "below"} the kanji`;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-4 rounded-xl border border-border-soft bg-white/[0.02] p-4">
      <h4 className="mb-2.5 text-[0.7rem] font-extrabold uppercase tracking-[1px] text-text-muted">{title}</h4>
      {children}
    </section>
  );
}

function Fields({ children }: { children: ReactNode }) {
  // Label beside its value, the same label column in every section; on a phone the label sits above the value.
  return <dl className="grid grid-cols-1 text-sm sm:grid-cols-[10rem_1fr] sm:gap-x-4 sm:gap-y-1.5">{children}</dl>;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-xs text-text-muted sm:text-sm">{label}</dt>
      <dd className="mb-2 min-w-0 break-words last:mb-0 sm:mb-0">{children}</dd>
    </>
  );
}

function LoadingLines() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-3/5" />
    </div>
  );
}

interface WordDetailsModalProps {
  candidate: KanjiWordCandidate;
  /** The kanji whose editor the word was opened from. */
  kanji: string;
  /** How that kanji is read in the word's reading group, when it is known. */
  readingLabel?: string;
  onClose: () => void;
}

/**
 * Everything about one candidate word: what the editor already knows about it for this kanji (list, algorithm,
 * students), then, read fresh from the tables, its whole dictionary row and every kanji it is linked to.
 */
export function WordDetailsModal({ candidate: c, kanji, readingLabel, onClose }: WordDetailsModalProps) {
  const [details, setDetails] = useState<KanjiWordDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryTick, setRetryTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchKanjiWordDetails(createClient(), c.id)
      .then((d) => {
        if (cancelled) return;
        setDetails(d);
        setError(null);
      })
      .catch((err) => {
        if (!cancelled) setError(describeKanjiWordsError(err, "Couldn't load this word."));
      });
    return () => {
      cancelled = true;
    };
  }, [c.id, retryTick]);

  const info = c.info;
  const reason = algoReason(c);
  const vocabulary = details?.vocabulary ?? null;
  const known = new Set(VOCABULARY_FIELDS.map(([column]) => column));
  const extraColumns = vocabulary
    ? Object.keys(vocabulary).filter((column) => !known.has(column) && !SHOWN_ELSEWHERE.has(column))
    : [];
  const romaji = typeof vocabulary?.romaji_reading === "string" ? vocabulary.romaji_reading : null;

  const loadState = error ? (
    <div className="text-sm">
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
  ) : (
    <LoadingLines />
  );

  // Portalled: the editor is a GlassCard, whose backdrop-filter would make the Modal's fixed backdrop cover just
  // the card instead of the whole screen.
  return createPortal(
    <Modal onClose={onClose} labelledBy="word-details-title" showCloseButton wide>
      <div className="max-h-[calc(100dvh-7rem)] overflow-y-auto pr-1 text-left">
        <div className="pr-10">
          <h3 id="word-details-title" className="text-[2rem] font-bold leading-[1.9]">
            {renderWordWithFurigana(c.word, c.furiganas, "text-[0.8rem] font-normal text-text-muted")}
          </h3>
          <p className="text-sm text-text-muted">{[c.kana, romaji].filter(Boolean).join(" · ") || "—"}</p>
        </div>
        <WordMeanings {...candidateMeanings(c)} className="mt-3" />

        <Section title={`In the list of ${kanji}`}>
          <Fields>
            <Field label="Final list">{c.in_final ? `In it${c.rank !== null ? `, rank ${c.rank}` : ""}` : "Not in it"}</Field>
            <Field label="Algorithm">
              {c.in_algo
                ? info?.pick_kind === "fill_in"
                  ? "Picks it, to fill the list"
                  : "Picks it, the best word of its reading group"
                : "Doesn't pick it"}
              {reason ? <span className="mt-0.5 block text-xs leading-snug text-text-muted">{reason}</span> : null}
            </Field>
            <Field label="Admin override">
              {c.override === "add" ? "Added by an admin" : c.override === "remove" ? "Removed by an admin" : "None"}
            </Field>
            <Field label="Reading group">
              {c.rg}
              {readingLabel ? ` (${readingLabel})` : ""}
            </Field>
            <Field label="Level">
              {c.jlpt ?? "No JLPT level"}, {levelsText(c.gap)}
            </Field>
            <Field label="Students with a card">{c.students}</Field>
            <Field label="Frequency score">{c.freq}</Field>
            {info ? (
              <>
                <Field label="Candidate class">
                  {CAND_CLASS[info.cand_class] ?? info.cand_class}
                  {info.in_class ? "" : " (not the best class this kanji has)"}
                </Field>
                <Field label="Place in its group">
                  {info.group_rank !== null && info.group_size !== null
                    ? `${info.group_rank} of ${info.group_size}`
                    : formatValue(info.group_size)}
                  {info.group_selected === false ? " (group not used)" : ""}
                </Field>
                {info.champion_word ? <Field label="Group's best word">{info.champion_word}</Field> : null}
                {info.dup_of_word ? <Field label="Duplicate of">{info.dup_of_word}</Field> : null}
              </>
            ) : null}
            <Field label="Kanji–word id">{c.id}</Field>
          </Fields>
        </Section>

        <Section title="Dictionary entry">
          {vocabulary ? (
            <Fields>
              {VOCABULARY_FIELDS.filter(([column]) => column in vocabulary).map(([column, label]) => (
                <Field key={column} label={label}>
                  {formatValue(vocabulary[column], SEGMENTED.has(column) ? " · " : ", ")}
                </Field>
              ))}
              {extraColumns.map((column) => (
                <Field key={column} label={column}>
                  {formatValue(vocabulary[column])}
                </Field>
              ))}
            </Fields>
          ) : (
            loadState
          )}
        </Section>

        <Section title="Kanji in this word">
          {details ? (
            details.kanji.length === 0 ? (
              <p className="text-sm italic text-text-muted">Not linked to any kanji.</p>
            ) : (
              <ul className="space-y-2">
                {details.kanji.map((link) => (
                  <li
                    key={link.kanji_word_id}
                    className={`flex items-start gap-3 rounded-lg border p-2.5 ${
                      link.kanji === kanji ? "border-accent-blue/30 bg-accent-blue/[0.06]" : "border-border-soft"
                    }`}
                  >
                    <span className="text-[1.6rem] font-bold leading-none">{link.kanji}</span>
                    <span className="min-w-0 flex-1 text-sm">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <LevelBadge level={link.level} size="sm" />
                        <span className="text-xs text-text-muted">
                          reading group {link.reading_group}
                          {link.kanji === kanji ? " · this kanji" : ""}
                        </span>
                      </span>
                      <span className="mt-0.5 block">{link.meanings.slice(0, 4).join(", ") || "—"}</span>
                    </span>
                    <span className="shrink-0 text-xs text-text-muted">
                      {link.rank !== null ? `In its list, rank ${link.rank}` : "Not in its list"}
                    </span>
                  </li>
                ))}
              </ul>
            )
          ) : (
            loadState
          )}
        </Section>
      </div>
    </Modal>,
    document.body
  );
}
