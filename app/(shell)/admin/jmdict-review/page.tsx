"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useRequireAdmin } from "@/lib/auth/useRequireAdmin";
import {
  useVocabularyMatchReviewQueue,
  resolveJmdictMatch,
  confirmNoMatch,
  unlinkJmdictMatch,
  unconfirmNoMatch,
} from "@/lib/client-data/jmdictReview";
import { Breadcrumbs } from "@/app/components/ui/Breadcrumbs";
import { Button } from "@/app/components/ui/Button";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { getErrorMessage } from "@/lib/api/client";
import type { AsyncStatus, JmdictCandidate, JmdictResolution, VocabularyMatchReviewRow } from "@/lib/types";

const JMDICT_REVIEW_PATH = "/admin/jmdict-review";

type CandidateCountFilter = "all" | "none" | "single" | "multiple";

function parseCountFilter(raw: string | null): CandidateCountFilter {
  return raw === "none" || raw === "single" || raw === "multiple" ? raw : "all";
}

function matchesCandidateCount(row: VocabularyMatchReviewRow, filter: CandidateCountFilter): boolean {
  const n = row.candidates.length;
  if (filter === "none") return n === 0;
  if (filter === "single") return n === 1;
  if (filter === "multiple") return n >= 2;
  return true;
}

/** Keeps every OTHER row's copy of a just-claimed/just-freed candidate in sync locally, so a
 * second card that also lists the same jmdict_entries row as a candidate reflects it's
 * taken/free without waiting for a full refetch -- see handlePick/handleUndo. Only ever touches
 * `already_linked_to_vocab_id`, never removes the candidate or reorders anything. */
function withCandidateLinkedTo(rows: VocabularyMatchReviewRow[], jrowId: number, vocabId: number | null): VocabularyMatchReviewRow[] {
  return rows.map((row) => {
    if (!row.candidates.some((c) => c.jrow_id === jrowId)) return row;
    return { ...row, candidates: row.candidates.map((c) => (c.jrow_id === jrowId ? { ...c, already_linked_to_vocab_id: vocabId } : c)) };
  });
}

/** Sets (or, when `resolution` is null, clears) a row's own resolution locally, right after a
 * pick/undo succeeds server-side -- see handlePick/handleUndo. Every other row is untouched, so
 * nothing about them moves/reorders/filters differently. */
function withResolution(rows: VocabularyMatchReviewRow[], vocabId: number, resolution: JmdictResolution | null): VocabularyMatchReviewRow[] {
  return rows.map((row) => (row.vocab_id === vocabId ? { ...row, resolution } : row));
}

function hasLinkedCandidate(row: VocabularyMatchReviewRow): boolean {
  return row.candidates.some((c) => c.already_linked_to_vocab_id !== null);
}

function allCandidatesLinked(row: VocabularyMatchReviewRow): boolean {
  return row.candidates.length > 0 && row.candidates.every((c) => c.already_linked_to_vocab_id !== null);
}

// Mirrors the exact-match join in get_vocabulary_match_review_queue() (20261120_..._resolved.sql):
// same kana_reading, and either the same word or both are kana-only entries.
function hasExactMatch(row: VocabularyMatchReviewRow): boolean {
  return row.candidates.some(
    (c) => c.kana_reading === row.vocab_kana && (c.word === row.vocab_word || (c.word === null && row.vocab_word === row.vocab_kana))
  );
}

// Same exact-meaning-overlap heuristic already validated in scripts/link-vocabulary-jmdict.mjs --
// used here only to SORT candidates (best guess first), never to auto-pick. Every row this page
// shows is exactly a case that heuristic couldn't already resolve on its own.
function normalizeMeaning(text: string): string {
  return text
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/["'.,;]/g, "")
    .replace(/^to\s+/, "")
    .trim();
}

function scoreCandidate(vocabMeanings: string[], candidateMeanings: string[]): number {
  const vocabNorm = vocabMeanings.map(normalizeMeaning).filter(Boolean);
  const candNorm = new Set(candidateMeanings.map(normalizeMeaning).filter(Boolean));
  let exactHits = 0;
  for (const m of vocabNorm) if (candNorm.has(m)) exactHits++;

  const vocabWords = new Set(vocabNorm.flatMap((m) => m.split(/\s+/)).filter((w) => w.length > 2));
  const candWords = new Set([...candNorm].flatMap((m) => m.split(/\s+/)).filter((w) => w.length > 2));
  let wordHits = 0;
  for (const w of vocabWords) if (candWords.has(w)) wordHits++;

  return exactHits * 10 + wordHits;
}

function matchesQuery(row: VocabularyMatchReviewRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = [row.vocab_word, row.vocab_kana, ...row.vocab_meanings].filter(Boolean).join(" ").toLowerCase();
  return haystack.includes(q);
}

interface FilterPillProps {
  active: boolean;
  label: string;
  count: number;
  onClick: () => void;
}

function FilterPill({ active, label, count, onClick }: FilterPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`cursor-pointer rounded-xl border px-3.5 py-2 text-[0.8rem] font-semibold transition-all ${
        active
          ? "border-accent-red/50 bg-accent-red/[0.12] text-accent-red"
          : "border-border-soft bg-white/[0.03] text-text-muted hover:border-white/20"
      }`}
    >
      {label} <span className="opacity-70">({count})</span>
    </button>
  );
}

interface ReviewCardProps {
  row: VocabularyMatchReviewRow;
  rowStatus: AsyncStatus | "idle";
  rowError: string | null;
  /** row.resolution -- null while still editable; once set (from the database, see
   * get_vocabulary_match_review_queue), the card stays right where it is (never
   * removed/reordered) but locks its radios onto this choice and swaps the saving/error line for
   * an Undo button. */
  resolved: JmdictResolution | null;
  onPick: (choice: JmdictResolution) => void;
  onUndo: () => void;
}

function ReviewCard({ row, rowStatus, rowError, resolved, onPick, onUndo }: ReviewCardProps) {
  const sortedCandidates = useMemo(
    () =>
      [...row.candidates].sort((a, b) => scoreCandidate(row.vocab_meanings, b.meanings) - scoreCandidate(row.vocab_meanings, a.meanings)),
    [row.candidates, row.vocab_meanings]
  );
  const busy = rowStatus === "loading";
  const name = `pick-${row.vocab_id}`;
  const resolvedCandidate =
    resolved?.type === "match" ? (row.candidates.find((c) => c.jrow_id === resolved.jrow_id) ?? null) : null;

  return (
    <GlassCard padding="sm" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-xl font-bold">{row.vocab_word ?? row.vocab_kana}</span>
        {row.vocab_word && <span className="text-sm text-text-muted">{row.vocab_kana}</span>}
        {row.vocab_jlpt_level && (
          <span className="rounded-full bg-accent-blue/15 px-2 py-0.5 text-[11px] font-semibold text-accent-blue">{row.vocab_jlpt_level}</span>
        )}
        {row.vocab_is_common_jisho && (
          <span className="rounded-full bg-accent-gold/15 px-2 py-0.5 text-[11px] font-semibold text-accent-gold">Common</span>
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {row.vocab_meanings.map((m, i) => (
          <span key={`${i}-${m}`} className="rounded-md bg-white/[0.06] px-2.5 py-0.5 text-normal font-semibold text-text-muted">
            {m}
          </span>
        ))}
      </div>
      {row.vocab_parts_of_speech.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {row.vocab_parts_of_speech.map((p, i) => (
            <span key={`${i}-${p}`} className="rounded-full border border-border-soft px-2.5 py-0.5 text-xs text-text-muted">
              {p}
            </span>
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2">
        {sortedCandidates.length === 0 && <p className="text-xs italic text-text-muted">Niciun candidat apropiat găsit.</p>}
        {sortedCandidates.map((c: JmdictCandidate) => {
          const isMine = resolved?.type === "match" && c.jrow_id === resolved.jrow_id;
          const takenByOther = !isMine && c.already_linked_to_vocab_id !== null;
          const locked = !!resolved || takenByOther;
          return (
            <div
              key={c.jrow_id}
              className={`flex items-start gap-2 rounded-lg border px-3 py-2 ${
                isMine
                  ? "border-accent-green/60 bg-accent-green/10"
                  : locked
                    ? "border-border-soft bg-bg-cards/60 opacity-50"
                    : "border-border-soft bg-bg-cards/60 has-[:checked]:border-accent-red/60 has-[:checked]:bg-accent-red/10"
              }`}
            >
              <input
                type="radio"
                name={name}
                className={`mt-1 ${locked ? "cursor-not-allowed" : "cursor-pointer"}`}
                checked={isMine}
                disabled={locked || busy}
                onChange={() => onPick({ type: "match", jrow_id: c.jrow_id })}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="font-semibold">{c.word ?? c.kana_reading}</span>
                  {c.word && <span className="text-xs text-text-muted">{c.kana_reading}</span>}
                  {c.is_common_jisho && (
                    <span className="rounded-full bg-accent-gold/15 px-1.5 py-0.5 text-[10px] font-semibold text-accent-gold">Common</span>
                  )}
                  <span className="ml-auto font-mono text-[11px] text-text-muted">#{c.jmdict_id}</span>
                </div>
                <div className="text-xs text-text-muted">{c.meanings.join(" · ")}</div>
                {c.parts_of_speech.length > 0 && <div className="text-[11px] text-text-muted/80">{c.parts_of_speech.join(", ")}</div>}
                {takenByOther && <div className="text-[11px] text-accent-red">Deja folosit de alt cuvânt</div>}
              </div>
            </div>
          );
        })}
        <div
          className={`flex items-center gap-2 rounded-lg border border-dashed px-3 py-2 ${
            resolved?.type === "no_match"
              ? "border-accent-green/60 bg-accent-green/10"
              : resolved
                ? "border-border-soft opacity-50"
                : "border-border-soft has-[:checked]:border-accent-red/60 has-[:checked]:bg-accent-red/10"
          }`}
        >
          <input
            type="radio"
            name={name}
            className={resolved ? "cursor-not-allowed" : "cursor-pointer"}
            checked={resolved?.type === "no_match"}
            disabled={!!resolved || busy}
            onChange={() => onPick({ type: "no_match" })}
          />
          <span className="font-medium">Nicio potrivire</span>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-h-4 text-xs">
          {busy && <span className="text-text-muted">{resolved ? "Se anulează..." : "Se salvează..."}</span>}
          {!busy && rowStatus === "error" && <span className="text-accent-red">{rowError ?? "A apărut o eroare."}</span>}
          {!busy && rowStatus !== "error" && resolved && (
            <span className="font-medium text-accent-green">
              ✓ {resolved.type === "match" ? `Asociat cu ${resolvedCandidate?.word ?? resolvedCandidate?.kana_reading ?? "—"}` : "Marcat: nicio potrivire"}
            </span>
          )}
        </div>
        {resolved && (
          <Button variant="secondary" size="sm" disabled={busy} onClick={onUndo}>
            Anulează
          </Button>
        )}
      </div>
    </GlassCard>
  );
}

function AdminJmdictReviewContent() {
  const { user } = useAuth();
  const { ready, checking } = useRequireAdmin();
  const { data: rows, setData, status } = useVocabularyMatchReviewQueue(ready ? user : null);
  const router = useRouter();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [countFilter, setCountFilter] = useState<CandidateCountFilter>(() => parseCountFilter(searchParams.get("candidates")));
  const [onlyLinked, setOnlyLinked] = useState(() => searchParams.get("linked") === "1");
  const [onlyAllLinked, setOnlyAllLinked] = useState(() => searchParams.get("all_linked") === "1");
  const [onlyExact, setOnlyExact] = useState(() => searchParams.get("exact") === "1");
  const [rowStatus, setRowStatus] = useState<Record<number, AsyncStatus | "idle">>({});
  const [rowError, setRowError] = useState<Record<number, string | null>>({});

  function pushFilters(next: { count: CandidateCountFilter; linked: boolean; allLinked: boolean; exact: boolean }) {
    const params = new URLSearchParams();
    if (next.count !== "all") params.set("candidates", next.count);
    if (next.linked) params.set("linked", "1");
    if (next.allLinked) params.set("all_linked", "1");
    if (next.exact) params.set("exact", "1");
    const qs = params.toString();
    router.replace(qs ? `${JMDICT_REVIEW_PATH}?${qs}` : JMDICT_REVIEW_PATH);
  }

  function selectCountFilter(next: CandidateCountFilter) {
    setCountFilter(next);
    pushFilters({ count: next, linked: onlyLinked, allLinked: onlyAllLinked, exact: onlyExact });
  }

  function toggleLinked() {
    const next = !onlyLinked;
    setOnlyLinked(next);
    pushFilters({ count: countFilter, linked: next, allLinked: onlyAllLinked, exact: onlyExact });
  }

  function toggleAllLinked() {
    const next = !onlyAllLinked;
    setOnlyAllLinked(next);
    pushFilters({ count: countFilter, linked: onlyLinked, allLinked: next, exact: onlyExact });
  }

  function toggleExact() {
    const next = !onlyExact;
    setOnlyExact(next);
    pushFilters({ count: countFilter, linked: onlyLinked, allLinked: onlyAllLinked, exact: next });
  }

  const searchFiltered = useMemo(() => (rows ?? []).filter((r) => matchesQuery(r, query)), [rows, query]);

  const counts = useMemo(
    () => ({
      all: searchFiltered.length,
      none: searchFiltered.filter((r) => matchesCandidateCount(r, "none")).length,
      single: searchFiltered.filter((r) => matchesCandidateCount(r, "single")).length,
      multiple: searchFiltered.filter((r) => matchesCandidateCount(r, "multiple")).length,
      linked: searchFiltered.filter(hasLinkedCandidate).length,
      allLinked: searchFiltered.filter(allCandidatesLinked).length,
      exact: searchFiltered.filter(hasExactMatch).length,
    }),
    [searchFiltered]
  );

  const filtered = useMemo(
    () =>
      searchFiltered.filter(
        (r) =>
          matchesCandidateCount(r, countFilter) &&
          (!onlyLinked || hasLinkedCandidate(r)) &&
          (!onlyAllLinked || allCandidatesLinked(r)) &&
          (!onlyExact || hasExactMatch(r))
      ),
    [searchFiltered, countFilter, onlyLinked, onlyAllLinked, onlyExact]
  );

  // Cards stay in `rows` once resolved (see handlePick), so the header's "N rămase" needs its
  // own count instead of just reading rows.length.
  const remainingCount = (rows ?? []).filter((r) => !r.resolution).length;

  // Never removes/reorders the card on success -- it stays exactly in place, marked resolved via
  // its own row.resolution (see withResolution), so an admin can keep scanning the same grid
  // instead of it visibly disappearing or filtering differently the moment something's checked.
  // Authoritative source is the database (get_vocabulary_match_review_queue returns resolved rows
  // too, within a rolling window) -- this optimistic update just avoids waiting on a refetch.
  async function handlePick(vocabId: number, choice: JmdictResolution) {
    setRowStatus((prev) => ({ ...prev, [vocabId]: "loading" }));
    setRowError((prev) => ({ ...prev, [vocabId]: null }));
    try {
      if (choice.type === "match") {
        await resolveJmdictMatch(choice.jrow_id, vocabId);
        // Also reflects the claim on every other card listing this same jmdict_entries row as a
        // candidate, so nobody can accidentally steal it from this word before the next refetch.
        setData((prev) => (prev ? withCandidateLinkedTo(prev, choice.jrow_id, vocabId) : prev));
      } else {
        await confirmNoMatch(vocabId);
      }
      setData((prev) => (prev ? withResolution(prev, vocabId, choice) : prev));
      setRowStatus((prev) => ({ ...prev, [vocabId]: "loaded" }));
    } catch (err) {
      setRowStatus((prev) => ({ ...prev, [vocabId]: "error" }));
      setRowError((prev) => ({ ...prev, [vocabId]: getErrorMessage(err, "Nu am putut salva alegerea.") }));
    }
  }

  // Reverses whatever handlePick did for this card -- unlinks the jmdict_entries row (or
  // un-confirms "no match"), then clears row.resolution so the card goes back to being editable,
  // still in the exact same place in the grid.
  async function handleUndo(vocabId: number, choice: JmdictResolution) {
    setRowStatus((prev) => ({ ...prev, [vocabId]: "loading" }));
    setRowError((prev) => ({ ...prev, [vocabId]: null }));
    try {
      if (choice.type === "match") {
        await unlinkJmdictMatch(choice.jrow_id);
        setData((prev) => (prev ? withCandidateLinkedTo(prev, choice.jrow_id, null) : prev));
      } else {
        await unconfirmNoMatch(vocabId);
      }
      setData((prev) => (prev ? withResolution(prev, vocabId, null) : prev));
      setRowStatus((prev) => ({ ...prev, [vocabId]: "idle" }));
    } catch (err) {
      setRowStatus((prev) => ({ ...prev, [vocabId]: "error" }));
      setRowError((prev) => ({ ...prev, [vocabId]: getErrorMessage(err, "Nu am putut anula alegerea.") }));
    }
  }

  if (checking || !ready) return <FullScreenLoader />;

  return (
    <div>
      <Breadcrumbs items={[{ label: "Teacher", href: "/admin" }, { label: "Dictionary matches" }]} />
      <h1 className="mb-2 text-[2.1rem] font-extrabold leading-[1.2] tracking-[-0.8px] text-center md:text-left">Dictionary matches</h1>
      <p className="mb-5 text-base leading-[1.6] text-text-muted text-center md:text-left">
        Cuvinte din <code>vocabulary</code> pe care potrivirea automată cu JMdict nu le-a putut stabili clar — alege candidatul corect
        (sau &quot;nicio potrivire&quot;) pentru fiecare. {status === "loaded" && <strong className="text-white">{remainingCount} rămase.</strong>}
      </p>

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Caută după cuvânt, citire sau sens..."
        className="mb-3 w-full max-w-sm rounded-xl border border-border-soft bg-bg-cards px-4 py-2.5 text-sm outline-none placeholder:text-text-muted focus:border-accent-red/50"
      />

      <div className="mb-2 flex flex-wrap gap-2">
        <FilterPill active={countFilter === "all"} label="All" count={counts.all} onClick={() => selectCountFilter("all")} />
        <FilterPill active={countFilter === "none"} label="No candidates" count={counts.none} onClick={() => selectCountFilter("none")} />
        <FilterPill active={countFilter === "single"} label="Single candidate" count={counts.single} onClick={() => selectCountFilter("single")} />
        <FilterPill
          active={countFilter === "multiple"}
          label="Multiple candidates"
          count={counts.multiple}
          onClick={() => selectCountFilter("multiple")}
        />
      </div>
      <div className="mb-5 flex flex-wrap gap-2">
        <FilterPill active={onlyLinked} label="Has linked candidate" count={counts.linked} onClick={toggleLinked} />
        <FilterPill active={onlyAllLinked} label="All candidates linked" count={counts.allLinked} onClick={toggleAllLinked} />
        <FilterPill active={onlyExact} label="Exact match" count={counts.exact} onClick={toggleExact} />
      </div>

      {status === "loading" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <GlassCard key={i} padding="sm">
              <Skeleton className="h-24 w-full" />
            </GlassCard>
          ))}
        </div>
      )}
      {status === "error" && <p className="text-center text-text-muted">Failed to load the review queue.</p>}
      {status === "loaded" && filtered.length === 0 && (
        <p className="text-center text-text-muted">
          {rows?.length === 0 ? "Totul e revizuit — nimic rămas." : "Niciun rezultat pentru căutarea sau filtrele curente."}
        </p>
      )}
      {status === "loaded" && filtered.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {filtered.map((row) => (
            <ReviewCard
              key={row.vocab_id}
              row={row}
              rowStatus={rowStatus[row.vocab_id] ?? "idle"}
              rowError={rowError[row.vocab_id] ?? null}
              resolved={row.resolution}
              onPick={(choice) => handlePick(row.vocab_id, choice)}
              onUndo={() => {
                if (row.resolution) void handleUndo(row.vocab_id, row.resolution);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export default function AdminJmdictReviewPage() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <AdminJmdictReviewContent />
    </Suspense>
  );
}
