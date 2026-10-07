"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { FaTriangleExclamation, FaXmark } from "react-icons/fa6";
import { createClient } from "@/lib/supabase/client";
import {
  describeKanjiWordsError,
  fetchKanjiWordCandidates,
  isKanjiWordsConflict,
  saveKanjiWords,
} from "@/lib/data/adminKanjiWords";
import { Button } from "@/app/components/ui/Button";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { useToast } from "@/app/components/ui/Toast";
import type { AsyncStatus, KanjiWordCandidate, KanjiWordCandidates, KanjiWordsRow } from "@/lib/types";
import { CandidateRow } from "./CandidateRow";
import { HistoryPanel } from "./HistoryPanel";
import { StudentPreview } from "./StudentPreview";

const REST_PAGE = 40;
/** Above this many words a kanji adds a lot of Word reading cards to a student's day. */
const WARN_ABOVE = 5;

function sameSet(a: Set<number>, b: Set<number>): boolean {
  return a.size === b.size && [...a].every((id) => b.has(id));
}

function matchesText(c: KanjiWordCandidate, q: string): boolean {
  if (!q) return true;
  return (
    c.word.includes(q) ||
    (c.kana ?? "").includes(q) ||
    (c.meanings ?? []).some((m) => m.toLowerCase().includes(q))
  );
}

interface EditorPanelProps {
  row: KanjiWordsRow;
  /** Something was written: the page re-reads its overview. */
  onChanged: () => void;
  onClose: () => void;
  /** Unsaved edits exist (or not), so the page can ask before switching to another kanji. */
  onDirtyChange: (dirty: boolean) => void;
}

/**
 * The side panel for one kanji. The draft lives here; nothing is written until "Save". A save sends the whole
 * list wanted plus the version this panel loaded, so a change made meanwhile (by another admin, or on the other
 * region) is refused instead of silently overwritten. The page mounts it with key={kanji id}.
 */
export function EditorPanel({ row, onChanged, onClose, onDirtyChange }: EditorPanelProps) {
  const { showToast } = useToast();
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [data, setData] = useState<KanjiWordCandidates | null>(null);
  const [initial, setInitial] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [tab, setTab] = useState<"words" | "history">("words");
  const [text, setText] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [showDisabled, setShowDisabled] = useState(false);
  const [restLimit, setRestLimit] = useState(REST_PAGE);
  // Filters of the "Other candidates" list only; the filter above it covers the chosen / algorithm words.
  const [restText, setRestText] = useState("");
  const [restGroup, setRestGroup] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [markReviewed, setMarkReviewed] = useState(true);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState(false);

  // Bumping the tick re-reads this kanji from the server and replaces the draft with what is saved there.
  const [reloadTick, setReloadTick] = useState(0);
  const reload = useCallback(() => setReloadTick((tick) => tick + 1), []);

  useEffect(() => {
    let cancelled = false;
    fetchKanjiWordCandidates(createClient(), row.id)
      .then((d) => {
        if (cancelled) return;
        const ids = new Set(d.candidates.filter((c) => c.in_final).map((c) => c.id));
        setData(d);
        setInitial(ids);
        setSelected(new Set(ids));
        setNote("");
        setConflict(false);
        setLoadError(null);
        setStatus("loaded");
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(describeKanjiWordsError(err, "Failed to load this kanji's words."));
        setStatus((prev) => (prev === "loaded" ? prev : "error"));
      });
    return () => {
      cancelled = true;
    };
  }, [row.id, reloadTick]);

  const dirty = !sameSet(selected, initial);
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  // The page keeps no memory of this panel once it unmounts.
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);

  const candidates = useMemo(() => data?.candidates ?? [], [data]);
  const algoIds = useMemo(() => new Set(candidates.filter((c) => c.in_algo).map((c) => c.id)), [candidates]);
  const q = text.trim().toLowerCase();
  const restQ = restText.trim().toLowerCase();

  // Words the admin is looking at by default: everything chosen now or by the algorithm. The rest of the
  // (up to 224) candidates sit behind "Show all candidates".
  const pinned = useMemo(
    () => candidates.filter((c) => (selected.has(c.id) || c.in_algo || c.in_final) && matchesText(c, q)),
    [candidates, selected, q]
  );
  // The other candidates before the search / reading-group filters: what "Show all (N)" counts.
  const restBase = useMemo(
    () => candidates.filter((c) => !(selected.has(c.id) || c.in_algo || c.in_final) && (showDisabled || c.enabled)),
    [candidates, selected, showDisabled]
  );
  const restGroups = useMemo(() => {
    const counts = new Map<number, number>();
    for (const c of restBase) counts.set(c.rg, (counts.get(c.rg) ?? 0) + 1);
    return [...counts].sort((a, b) => a[0] - b[0]);
  }, [restBase]);
  // A group that has emptied (its last words were just ticked) no longer filters anything.
  const activeGroup = restGroup !== null && restGroups.some(([g]) => g === restGroup) ? restGroup : null;
  const rest = useMemo(
    () => restBase.filter((c) => (activeGroup === null || c.rg === activeGroup) && matchesText(c, restQ)),
    [restBase, activeGroup, restQ]
  );
  const restFiltered = restQ !== "" || activeGroup !== null;
  const hiddenDisabled = useMemo(
    () => candidates.filter((c) => !c.enabled && !(selected.has(c.id) || c.in_algo || c.in_final)).length,
    [candidates, selected]
  );
  const chosen = useMemo(() => candidates.filter((c) => selected.has(c.id)), [candidates, selected]);

  const removedWithCards = candidates.filter((c) => initial.has(c.id) && !selected.has(c.id) && c.students > 0);
  const addedCount = candidates.filter((c) => selected.has(c.id) && !initial.has(c.id)).length;
  const reviewedChange = markReviewed && !(data?.reviewed ?? false);
  const canSave = !saving && (dirty || reviewedChange);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function revertWord(c: KanjiWordCandidate) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (c.in_algo) next.add(c.id);
      else next.delete(c.id);
      return next;
    });
  }

  async function handleSave() {
    if (!data) return;
    setSaving(true);
    try {
      const result = await saveKanjiWords(createClient(), {
        kanjiId: row.id,
        wordIds: [...selected],
        expectedVersion: data.version,
        note: note.trim() || null,
        reviewed: markReviewed ? true : null,
      });
      showToast(result.changed ? `Saved ${row.k} (version ${result.version}).` : "Nothing had changed.");
      // What was just saved is the new baseline right away; the re-read below confirms it from the server.
      setInitial(new Set(selected));
      setData({ ...data, version: result.version, reviewed: markReviewed ? true : data.reviewed });
      onChanged();
      reload();
    } catch (err) {
      if (isKanjiWordsConflict(err)) setConflict(true);
      else showToast(describeKanjiWordsError(err, "Failed to save."), "error");
    } finally {
      setSaving(false);
    }
  }

  const meanings = (data?.kanji.meanings ?? row.m).slice(0, 4).join(", ");
  const readings = [...(data?.kanji.kun ?? row.kun), ...(data?.kanji.on ?? row.on)].join("、 ");

  return (
    <GlassCard padding="sm">
      <div className="flex items-start gap-4">
        <div className="text-[3.2rem] font-bold leading-none">{row.k}</div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <LevelBadge level={row.lv} size="sm" />
            <span className="text-xs text-text-muted">
              Version {data?.version ?? row.v}
              {(data?.reviewed ?? row.r) ? " · reviewed" : " · not reviewed"}
            </span>
          </div>
          <p className="mt-1 text-sm">{meanings || "—"}</p>
          <p className="text-xs text-text-muted">{readings}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border-soft text-text-muted transition-colors hover:text-white"
        >
          <FaXmark />
        </button>
      </div>

      <div role="tablist" className="mt-4 flex gap-1.5 border-b border-border-soft pb-3">
        {(["words", "history"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`cursor-pointer rounded-lg border px-3.5 py-1.5 text-[0.82rem] font-extrabold transition-all ${
              tab === t
                ? "border-accent-blue/35 bg-accent-blue/[0.12] text-accent-blue"
                : "border-border-soft bg-white/[0.03] text-text-muted hover:border-white/20"
            }`}
          >
            {t === "words" ? "Words" : "History"}
          </button>
        ))}
      </div>

      {status === "loading" ? (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
      ) : null}
      {status === "error" ? (
        <div className="mt-4 text-sm">
          <p className="text-text-muted">{loadError}</p>
          <button type="button" onClick={reload} className="mt-2 cursor-pointer font-bold text-accent-blue hover:underline">
            Try again
          </button>
        </div>
      ) : null}

      {status === "loaded" && data && tab === "history" ? (
        <div className="mt-4">
          <HistoryPanel
            kanjiId={row.id}
            currentVersion={data.version}
            onRestored={() => {
              onChanged();
              reload();
            }}
          />
        </div>
      ) : null}

      {status === "loaded" && data && tab === "words" ? (
        <div className="mt-4 space-y-5">
          {conflict ? (
            <div role="alert" className="rounded-xl border border-accent-red/30 bg-accent-red/10 p-3 text-sm">
              <p className="font-bold text-accent-red">This kanji changed in the meantime.</p>
              <p className="mt-0.5 text-text-muted">
                Someone else saved it (or it changed on the other region) after you opened it. Load the latest version to see
                it; your unsaved edits will be discarded.
              </p>
              <button
                type="button"
                onClick={reload}
                className="mt-2 cursor-pointer rounded-lg border border-accent-red/40 px-3 py-1 text-[0.8rem] font-bold text-accent-red hover:bg-accent-red/10"
              >
                Load the latest version
              </button>
            </div>
          ) : null}

          <section>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[0.7rem] font-extrabold uppercase tracking-[1px] text-text-muted">
                List ({selected.size} word{selected.size === 1 ? "" : "s"})
              </h3>
              <button
                type="button"
                onClick={() => setSelected(new Set(algoIds))}
                disabled={sameSet(selected, algoIds)}
                className="cursor-pointer text-[0.8rem] font-bold text-accent-blue hover:underline disabled:cursor-default disabled:text-text-muted disabled:no-underline"
              >
                Back to the algorithm&apos;s list
              </button>
            </div>
            {selected.size > WARN_ABOVE ? (
              <p className="mt-2 flex items-start gap-2 text-[0.82rem] text-accent-orange">
                <FaTriangleExclamation className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                More than {WARN_ABOVE} words: each one becomes a Word reading card, so this kanji adds a lot of new cards.
              </p>
            ) : null}
            {chosen.length === 0 ? (
              <p className="mt-2 text-sm italic text-text-muted">No words: pick some below.</p>
            ) : (
              <p className="mt-2 flex flex-wrap gap-1.5 text-[1.1rem] font-bold">
                {chosen.map((c) => (
                  <span key={c.id} className="rounded-lg border border-accent-blue/25 bg-accent-blue/[0.08] px-2 py-0.5">
                    {c.word}
                  </span>
                ))}
              </p>
            )}
          </section>

          <StudentPreview kanji={row.k} words={chosen} currentCount={initial.size} />

          <section>
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Filter the chosen and algorithm words…"
                className="min-w-0 flex-1 basis-48 rounded-xl border border-border-soft bg-bg-cards px-3.5 py-2 text-sm outline-none placeholder:text-text-muted focus:border-accent-red/50"
              />
              <span className="text-xs text-text-muted">{candidates.length} candidates</span>
            </div>

            <h3 className="mt-4 mb-2 text-[0.7rem] font-extrabold uppercase tracking-[1px] text-text-muted">
              Chosen and picked by the algorithm
            </h3>
            {pinned.length === 0 ? (
              <p className="text-sm italic text-text-muted">{q ? "No match." : "None."}</p>
            ) : (
              <ul className="space-y-2">
                {pinned.map((c) => (
                  <CandidateRow
                    key={c.id}
                    candidate={c}
                    checked={selected.has(c.id)}
                    onToggle={() => toggle(c.id)}
                    onRevert={() => revertWord(c)}
                  />
                ))}
              </ul>
            )}

            <div className="mt-5 flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[0.7rem] font-extrabold uppercase tracking-[1px] text-text-muted">Other candidates</h3>
              <button
                type="button"
                onClick={() => setShowAll((v) => !v)}
                aria-expanded={showAll}
                className="cursor-pointer text-[0.8rem] font-bold text-accent-blue hover:underline"
              >
                {showAll ? "Hide" : `Show all (${restBase.length})`}
              </button>
            </div>
            {showAll ? (
              <>
                <div className="mt-2 space-y-2">
                  <input
                    type="search"
                    value={restText}
                    onChange={(e) => {
                      setRestText(e.target.value);
                      setRestLimit(REST_PAGE);
                    }}
                    placeholder="Search the other candidates (word, reading, meaning)…"
                    aria-label="Search the other candidates"
                    className="w-full rounded-xl border border-border-soft bg-bg-cards px-3.5 py-2 text-sm outline-none placeholder:text-text-muted focus:border-accent-red/50"
                  />
                  {restGroups.length > 1 ? (
                    <div role="group" aria-label="Filter by reading group" className="flex flex-wrap items-center gap-1.5">
                      <span className="mr-1 text-xs text-text-muted">Reading group</span>
                      {[{ group: null, count: restBase.length }, ...restGroups.map(([group, count]) => ({ group, count }))].map(
                        ({ group, count }) => (
                          <button
                            key={group ?? "all"}
                            type="button"
                            aria-pressed={activeGroup === group}
                            onClick={() => {
                              setRestGroup(group);
                              setRestLimit(REST_PAGE);
                            }}
                            className={`cursor-pointer rounded-lg border px-2.5 py-1 text-[0.75rem] font-bold transition-all ${
                              activeGroup === group
                                ? "border-accent-blue/35 bg-accent-blue/[0.12] text-accent-blue"
                                : "border-border-soft bg-white/[0.03] text-text-muted hover:border-white/20"
                            }`}
                          >
                            {group === null ? "All" : `Group ${group}`}
                            <span className="ml-1 font-normal opacity-70">{count}</span>
                          </button>
                        )
                      )}
                    </div>
                  ) : null}
                  {restFiltered ? (
                    <p className="text-xs text-text-muted">
                      {rest.length} of {restBase.length} other candidate{restBase.length === 1 ? "" : "s"}
                    </p>
                  ) : null}
                </div>
                {hiddenDisabled > 0 ? (
                  <label className="mt-2 flex cursor-pointer items-center gap-2 text-[0.82rem] text-text-muted">
                    <input
                      type="checkbox"
                      checked={showDisabled}
                      onChange={(e) => setShowDisabled(e.target.checked)}
                      className="h-4 w-4 cursor-pointer accent-accent-blue"
                    />
                    Also show words not enabled for study ({hiddenDisabled}); they can&apos;t be chosen
                  </label>
                ) : null}
                {rest.length === 0 ? (
                  <p className="mt-2 text-sm italic text-text-muted">{restFiltered ? "No match." : "None."}</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {rest.slice(0, restLimit).map((c) => (
                      <CandidateRow
                        key={c.id}
                        candidate={c}
                        checked={selected.has(c.id)}
                        onToggle={() => toggle(c.id)}
                        onRevert={() => revertWord(c)}
                      />
                    ))}
                  </ul>
                )}
                {rest.length > restLimit ? (
                  <button
                    type="button"
                    onClick={() => setRestLimit((n) => n + REST_PAGE)}
                    className="mt-3 w-full cursor-pointer rounded-lg border border-border-soft bg-white/[0.03] py-2 text-[0.85rem] font-bold text-text-muted hover:border-white/20 hover:text-white"
                  >
                    Show {Math.min(REST_PAGE, rest.length - restLimit)} more ({rest.length - restLimit} left)
                  </button>
                ) : null}
              </>
            ) : null}
          </section>

          <section className="sticky bottom-0 z-10 -mx-5 -mb-5 space-y-3 rounded-b-2xl border-t border-border-soft bg-gray-900/95 px-5 pt-4 pb-5 backdrop-blur-[10px]">
            {removedWithCards.length > 0 ? (
              <p className="text-[0.82rem] leading-snug text-text-muted">
                {removedWithCards.map((c) => c.word).join(", ")}: students who already have a card on{" "}
                {removedWithCards.length === 1 ? "this word" : "these words"} keep it and keep reviewing it. Only new
                introductions use the new list.
              </p>
            ) : null}
            {addedCount > 0 ? (
              <p className="text-[0.82rem] leading-snug text-text-muted">
                Added words only reach students who meet this kanji from now on; those who already learned it don&apos;t get a
                card for them.
              </p>
            ) : null}
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              placeholder="Note (optional), kept in the history"
              className="w-full rounded-xl border border-border-soft bg-bg-cards px-3.5 py-2 text-sm outline-none placeholder:text-text-muted focus:border-accent-red/50"
            />
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={markReviewed}
                  onChange={(e) => setMarkReviewed(e.target.checked)}
                  className="h-4 w-4 cursor-pointer accent-accent-blue"
                />
                Mark as reviewed
              </label>
              <Button size="sm" onClick={() => void handleSave()} loading={saving} disabled={!canSave}>
                {dirty ? "Save changes" : "Mark as reviewed"}
              </Button>
              {dirty ? (
                <Button size="sm" variant="secondary" onClick={() => setSelected(new Set(initial))} disabled={saving}>
                  Discard changes
                </Button>
              ) : null}
              {!dirty && !reviewedChange ? <span className="text-xs text-text-muted">No changes to save.</span> : null}
            </div>
          </section>
        </div>
      ) : null}
    </GlassCard>
  );
}
