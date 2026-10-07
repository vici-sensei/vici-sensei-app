"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FaArrowDownWideShort, FaArrowUpWideShort, FaClockRotateLeft, FaSliders } from "react-icons/fa6";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useRequireAdmin } from "@/lib/auth/useRequireAdmin";
import { useKanjiWordsOverview } from "@/lib/client-data/adminKanjiWords";
import {
  bulkKanjiWords,
  fetchKanjiWordsParity,
  restoreKanjiWordsTo,
  undoKanjiWordsBatch,
} from "@/lib/data/adminKanjiWords";
import { createClient } from "@/lib/supabase/client";
import { isMultiRegionEnabled } from "@/lib/supabase/regions";
import { Breadcrumbs } from "@/app/components/ui/Breadcrumbs";
import { Collapsible } from "@/app/components/ui/Collapsible";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { useToast } from "@/app/components/ui/Toast";
import type { KanjiWordsBatch, KanjiWordsBulkResult, KanjiWordsParity } from "@/lib/types";
import { BatchesModal } from "./BatchesModal";
import { BulkMenu, type BulkChoice } from "./BulkMenu";
import { EditorPanel } from "./EditorPanel";
import { FilterPanel } from "./FilterPanel";
import { KanjiList } from "./KanjiList";
import { OperationModal, type OperationSpec } from "./OperationModal";
import {
  activeFilterCount,
  DEFAULT_FILTERS,
  defaultDir,
  filterKanji,
  KANJI_LEVELS,
  parseView,
  serializeView,
  SORT_LABELS,
  sortKanji,
  type KanjiFilters,
  type KanjiView,
  type SortKey,
} from "./kanjiWordsView";

const LIST_PAGE = 100;
const SORT_OPTIONS = Object.keys(SORT_LABELS) as SortKey[];

function bulkSpec(choice: BulkChoice, ids: number[], versions: Record<number, number>): OperationSpec {
  const run = (dryRun: boolean, note: string | null) =>
    bulkKanjiWords(createClient(), {
      kanjiIds: ids,
      op: choice.op,
      params: choice.params,
      expectedVersions: versions,
      note,
      dryRun,
    });

  if (choice.op === "remove_gap") {
    const gap = Number(choice.params.min_gap ?? 2);
    return {
      title: `Remove words ${gap}+ levels above the kanji`,
      description: `Takes every word whose level is at least ${gap} step${gap === 1 ? "" : "s"} above its kanji's own out of the list, for ${ids.length} kanji. A word with no JLPT level counts as beyond N1, like in the algorithm. The words stay available as candidates.`,
      confirmLabel: "Remove words",
      danger: true,
      run,
    };
  }
  if (choice.op === "reset") {
    return {
      title: "Reset to the algorithm's list",
      description: `Drops every admin change on ${ids.length} kanji, so they get exactly the words the algorithm picks. The old versions stay in the history.`,
      confirmLabel: "Reset",
      danger: true,
      run,
    };
  }
  const reviewed = choice.params.reviewed !== false;
  return {
    title: reviewed ? "Mark as reviewed" : "Mark as not reviewed",
    description: `${reviewed ? "Marks" : "Clears the reviewed mark of"} ${ids.length} kanji. It doesn't change any words.`,
    confirmLabel: reviewed ? "Mark reviewed" : "Mark not reviewed",
    run,
  };
}

function AdminKanjiWords() {
  const { user } = useAuth();
  const { ready, checking } = useRequireAdmin();
  const multiRegion = isMultiRegionEnabled();
  const { data, status, error, refetch } = useKanjiWordsOverview(ready && multiRegion ? user : null);
  const { showToast } = useToast();
  const searchParams = useSearchParams();

  // Read from the URL once; from then on local state is the source of truth and every change is written back
  // with replaceState (a filter tweak shouldn't become a Back step), like the student list.
  const [initialUrl] = useState(() => parseView(new URLSearchParams(searchParams.toString())));
  const [view, setView] = useState<KanjiView>(initialUrl.view);
  const [selectedId, setSelectedId] = useState<number | null>(initialUrl.selected);
  const [filtersOpen, setFiltersOpen] = useState(() => activeFilterCount(initialUrl.view.filters) > 0);
  const [limit, setLimit] = useState(LIST_PAGE);
  const [checked, setChecked] = useState<Set<number>>(new Set());
  const [dirty, setDirty] = useState(false);
  // Waiting for "discard unsaved edits?": the kanji to open afterwards (null = close the panel).
  const [pendingSelect, setPendingSelect] = useState<{ id: number | null } | null>(null);
  const [operation, setOperation] = useState<OperationSpec | null>(null);
  const [batchesOpen, setBatchesOpen] = useState(false);
  const [parity, setParity] = useState<KanjiWordsParity | null>(null);
  const [now] = useState(() => Date.now());
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!ready || !multiRegion) return;
    let cancelled = false;
    fetchKanjiWordsParity(createClient())
      .then((result) => {
        if (!cancelled) setParity(result);
      })
      .catch(() => {
        // The banner is a courtesy; a failed check isn't worth a second error on the page.
      });
    return () => {
      cancelled = true;
    };
  }, [ready, multiRegion]);

  // The list stays pinned while the page scrolls, so a kanji picked far down the list would otherwise open its
  // editor out of sight above; bring it back under the header.
  useEffect(() => {
    const el = editorRef.current;
    if (el && selectedId !== null && el.getBoundingClientRect().top < 80) {
      el.scrollIntoView({ block: "start", behavior: "smooth" });
    }
  }, [selectedId]);

  const rows = useMemo(() => data?.kanji ?? [], [data]);
  const visible = useMemo(
    () => sortKanji(filterKanji(rows, view, now), view.sort, view.dir, view.filters.onAlgo),
    [rows, view, now]
  );
  const adminOptions = useMemo(
    () => [...new Set(rows.map((r) => r.lb).filter((email): email is string => email !== null))].sort(),
    [rows]
  );
  const progress = useMemo(() => {
    const byLevel = new Map<string, { total: number; reviewed: number }>(
      KANJI_LEVELS.map((level) => [level, { total: 0, reviewed: 0 }])
    );
    let reviewed = 0;
    for (const row of rows) {
      const entry = byLevel.get(row.lv ?? "");
      if (entry) {
        entry.total += 1;
        if (row.r) entry.reviewed += 1;
      }
      if (row.r) reviewed += 1;
    }
    return { total: rows.length, reviewed, byLevel };
  }, [rows]);
  const selectedRow = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);

  if (checking || !ready) return <FullScreenLoader />;

  function writeUrl(nextView: KanjiView, nextSelected: number | null) {
    const qs = serializeView(nextView, nextSelected);
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }

  function updateView(next: KanjiView) {
    setView(next);
    setLimit(LIST_PAGE);
    writeUrl(next, selectedId);
  }

  function selectKanji(id: number | null) {
    setSelectedId(id);
    setDirty(false);
    writeUrl(view, id);
  }

  function requestSelect(id: number | null) {
    if (id === selectedId) return;
    if (dirty) setPendingSelect({ id });
    else selectKanji(id);
  }

  function handleSort(key: SortKey) {
    updateView({ ...view, sort: key, dir: defaultDir(key) });
  }

  function handleFilterChange(patch: Partial<KanjiFilters>) {
    updateView({ ...view, filters: { ...view.filters, ...patch } });
  }

  function toggleChecked(id: number) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const allShownChecked = visible.length > 0 && visible.every((r) => checked.has(r.id));
  function toggleAllShown() {
    setChecked(allShownChecked ? new Set() : new Set(visible.map((r) => r.id)));
  }

  // The bulk actions touch the ticked kanji, or -- with none ticked -- everything the filters leave on screen.
  const scopeIds = checked.size > 0 ? [...checked] : visible.map((r) => r.id);
  const scopeLabel = checked.size > 0 ? "the kanji you ticked" : "all the kanji shown";

  function startBulk(choice: BulkChoice) {
    const idSet = new Set(scopeIds);
    const versions: Record<number, number> = {};
    for (const row of rows) if (idSet.has(row.id)) versions[row.id] = row.v;
    setOperation(bulkSpec(choice, scopeIds, versions));
  }

  function startUndo(batch: KanjiWordsBatch) {
    setBatchesOpen(false);
    setOperation({
      title: "Undo this bulk change",
      description: `Puts back the ${batch.undoable} kanji that are still exactly as this batch left them. Kanji edited afterwards are left alone.`,
      confirmLabel: "Undo the batch",
      danger: true,
      run: (dryRun, note) => undoKanjiWordsBatch(createClient(), { batchId: batch.batch_id, note, dryRun }),
    });
  }

  function startRestoreTo(at: string) {
    setBatchesOpen(false);
    setOperation({
      title: "Restore every kanji to an earlier moment",
      description: `Each kanji goes back to the last version it had at or before ${new Date(at).toLocaleString()}. Kanji that had no change by then go back to the algorithm's list. Everything is kept in the history.`,
      confirmLabel: "Restore all",
      danger: true,
      run: (dryRun, note) => restoreKanjiWordsTo(createClient(), { at, note, dryRun }),
    });
  }

  function handleOperationDone(result: KanjiWordsBulkResult) {
    setOperation(null);
    setChecked(new Set());
    showToast(
      result.changed === 0
        ? "Nothing changed."
        : `${result.changed} kanji changed. You can undo it from "Bulk changes".`
    );
    refetch();
  }

  const filterCount = activeFilterCount(view.filters);

  if (!multiRegion) {
    return (
      <div>
        <Breadcrumbs items={[{ label: "Teacher", href: "/admin" }, { label: "Kanji words" }]} />
        <h1 className="mb-2 text-[2.1rem] font-extrabold leading-[1.2] tracking-[-0.8px] text-center md:text-left">Kanji words</h1>
        <p className="text-base leading-[1.6] text-text-muted text-center md:text-left">
          This page needs the EU/US projects (NEXT_PUBLIC_MULTI_REGION), which hold the kanji-words tables.
        </p>
      </div>
    );
  }

  return (
    <div>
      <Breadcrumbs items={[{ label: "Teacher", href: "/admin" }, { label: "Kanji words" }]} />
      <h1 className="mb-2 text-[2.1rem] font-extrabold leading-[1.2] tracking-[-0.8px] text-center md:text-left">Kanji words</h1>
      <p className="mb-5 text-base leading-[1.6] text-text-muted text-center md:text-left">
        Choose which words each kanji is taught with. The algorithm picks first; what you change is kept on top of it, and
        every change can be undone.
      </p>

      {parity && parity.in_sync === false ? (
        <GlassCard padding="sm" tone="danger" className="mb-4">
          <p className="text-sm font-bold text-accent-red">The two regions don&apos;t hold the same kanji words.</p>
          <p className="mt-0.5 text-sm text-text-muted">
            Saving keeps working, but one region has changes the other lacks. Run <code>admin_kanji_words_parity()</code> to
            see how they differ.
          </p>
        </GlassCard>
      ) : null}
      {parity && parity.in_sync === null ? (
        <GlassCard padding="sm" tone="danger" className="mb-4">
          <p className="text-sm font-bold text-accent-red">The link to the other region isn&apos;t set up.</p>
          <p className="mt-0.5 text-sm text-text-muted">Saving is refused until it is, so the two regions never disagree.</p>
        </GlassCard>
      ) : null}

      <GlassCard padding="sm" className="mb-4">
        {status === "loaded" ? (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <span className="text-sm font-bold">
                Reviewed {progress.reviewed} of {progress.total} kanji
              </span>
              <span className="flex flex-wrap gap-x-3 text-xs text-text-muted">
                {KANJI_LEVELS.map((level) => {
                  const entry = progress.byLevel.get(level);
                  return (
                    <span key={level}>
                      {level} {entry?.reviewed ?? 0}/{entry?.total ?? 0}
                    </span>
                  );
                })}
              </span>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-accent-green transition-[width] duration-300"
                style={{ width: `${progress.total === 0 ? 0 : (progress.reviewed / progress.total) * 100}%` }}
              />
            </div>
          </>
        ) : (
          <Skeleton className="h-9 w-full" />
        )}
      </GlassCard>

      <div className="flex flex-wrap items-center gap-2.5">
        <input
          type="search"
          value={view.query}
          onChange={(e) => updateView({ ...view, query: e.target.value })}
          placeholder="Search a kanji, reading, meaning or word…"
          className="min-w-0 max-w-sm flex-1 basis-60 rounded-xl border border-border-soft bg-bg-cards px-4 py-2.5 text-sm outline-none placeholder:text-text-muted focus:border-accent-red/50"
        />
        <button
          type="button"
          aria-expanded={filtersOpen}
          onClick={() => setFiltersOpen((open) => !open)}
          className={`inline-flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-[0.85rem] font-extrabold transition-all ${
            filtersOpen || filterCount > 0
              ? "border-accent-blue/35 bg-accent-blue/[0.12] text-accent-blue"
              : "border-border-soft bg-white/[0.03] text-text-muted hover:border-white/20"
          }`}
        >
          <FaSliders className="h-3.5 w-3.5" />
          Filters{filterCount > 0 ? ` (${filterCount})` : ""}
        </button>
        {filterCount > 0 ? (
          <button
            type="button"
            onClick={() => updateView({ ...view, filters: DEFAULT_FILTERS })}
            className="cursor-pointer px-1 text-[0.85rem] font-bold text-text-muted hover:text-white"
          >
            Reset
          </button>
        ) : null}
        <select
          aria-label="Sort by"
          value={view.sort}
          onChange={(e) => handleSort(e.target.value as SortKey)}
          className="rounded-xl border border-border-soft bg-bg-cards px-3 py-2.5 text-[0.85rem] font-bold text-text-muted outline-none focus:border-accent-red/50"
        >
          {SORT_OPTIONS.map((key) => (
            <option key={key} value={key}>
              {SORT_LABELS[key]}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => updateView({ ...view, dir: view.dir === "asc" ? "desc" : "asc" })}
          aria-label={view.dir === "asc" ? "Sorted ascending; switch to descending" : "Sorted descending; switch to ascending"}
          title={view.dir === "asc" ? "Ascending" : "Descending"}
          className="inline-flex h-[42px] w-[42px] cursor-pointer items-center justify-center rounded-xl border border-border-soft bg-white/[0.03] text-text-muted transition-all hover:border-white/20 hover:text-white"
        >
          {view.dir === "asc" ? <FaArrowUpWideShort className="h-3.5 w-3.5" /> : <FaArrowDownWideShort className="h-3.5 w-3.5" />}
        </button>
        <BulkMenu scopeCount={scopeIds.length} scopeLabel={scopeLabel} onPick={startBulk} />
        <button
          type="button"
          onClick={() => setBatchesOpen(true)}
          className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-border-soft bg-white/[0.03] px-4 py-2.5 text-[0.85rem] font-extrabold text-text-muted transition-all hover:border-white/20"
        >
          <FaClockRotateLeft className="h-3.5 w-3.5" />
          Bulk changes
        </button>
      </div>

      <Collapsible open={filtersOpen} openClassName="mt-4">
        <GlassCard padding="sm">
          <FilterPanel filters={view.filters} onChange={handleFilterChange} adminOptions={adminOptions} />
        </GlassCard>
      </Collapsible>

      <div className="mt-4 mb-2.5 flex flex-wrap items-center justify-between gap-2 text-sm text-text-muted">
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={allShownChecked}
            onChange={toggleAllShown}
            disabled={visible.length === 0}
            className="h-4 w-4 cursor-pointer accent-accent-blue"
          />
          {checked.size > 0 ? `${checked.size} ticked` : "Tick all shown"}
        </label>
        <span>{status === "loaded" ? `Showing ${visible.length} of ${rows.length} kanji` : " "}</span>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
        <GlassCard padding="sm" className="overflow-hidden lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-y-auto">
          {status === "loading" ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : null}
          {status === "error" ? <p className="p-6 text-center text-text-muted">{error ?? "Failed to load kanji words."}</p> : null}
          {status === "loaded" && visible.length === 0 ? (
            <p className="p-6 text-center text-text-muted">No kanji match these filters.</p>
          ) : null}
          {status === "loaded" && visible.length > 0 ? (
            <KanjiList
              rows={visible}
              selectedId={selectedId}
              checked={checked}
              limit={limit}
              onShowMore={() => setLimit((n) => n + LIST_PAGE)}
              onSelect={requestSelect}
              onToggleChecked={toggleChecked}
            />
          ) : null}
        </GlassCard>

        {/* Beside the list on a wide screen; a full-screen sheet on a phone. */}
        <div
          ref={editorRef}
          className={
            selectedRow
              ? "scroll-mt-20 fixed inset-0 z-[120] overflow-y-auto bg-bg-main p-4 lg:static lg:inset-auto lg:z-auto lg:overflow-visible lg:bg-transparent lg:p-0"
              : "hidden lg:block"
          }
        >
          {selectedRow ? (
            <EditorPanel
              key={selectedRow.id}
              row={selectedRow}
              onChanged={refetch}
              onClose={() => requestSelect(null)}
              onDirtyChange={setDirty}
            />
          ) : (
            <GlassCard padding="md" className="text-center text-text-muted">
              Pick a kanji on the left to see every word it appears in and choose which ones it is taught with.
            </GlassCard>
          )}
        </div>
      </div>

      {pendingSelect ? (
        <ConfirmDialog
          title="Discard your unsaved changes?"
          description="The words you ticked or unticked on this kanji haven't been saved."
          confirmLabel="Discard"
          danger
          onConfirm={() => {
            selectKanji(pendingSelect.id);
            setPendingSelect(null);
          }}
          onCancel={() => setPendingSelect(null)}
        />
      ) : null}

      {batchesOpen ? <BatchesModal onClose={() => setBatchesOpen(false)} onUndo={startUndo} onRestoreTo={startRestoreTo} /> : null}

      {operation ? (
        <OperationModal spec={operation} onClose={() => setOperation(null)} onDone={handleOperationDone} />
      ) : null}
    </div>
  );
}

export default function AdminKanjiWordsPage() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <AdminKanjiWords />
    </Suspense>
  );
}
