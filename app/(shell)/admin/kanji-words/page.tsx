"use client";

import { Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { FaArrowDownWideShort, FaArrowUpWideShort, FaClockRotateLeft, FaSliders } from "react-icons/fa6";
import { useAuth } from "@/lib/auth/AuthProvider";
import { reloadKanjiWords, useKanjiWords } from "@/lib/client-data/adminKanjiWords";
import {
  bulkKanjiWords,
  fetchKanjiWordsParity,
  restoreKanjiWordsTo,
  undoKanjiWordsBatch,
} from "@/lib/data/adminKanjiWords";
import { createClient } from "@/lib/supabase/client";
import { isMultiRegionEnabled } from "@/lib/supabase/regions";
import { Breadcrumbs } from "@/app/components/ui/Breadcrumbs";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { PageHeader } from "@/app/components/ui/PageHeader";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { useToast } from "@/app/components/ui/Toast";
import type { KanjiWordsBatch, KanjiWordsBulkResult, KanjiWordsParity } from "@/lib/types";
import { BatchesModal } from "./BatchesModal";
import { BulkMenu, type BulkChoice } from "./BulkMenu";
import { EditorPanel } from "./EditorPanel";
import { FilterPanel } from "./FilterPanel";
import { FloatingCard } from "./FloatingDock";
import { KanjiList } from "./KanjiList";
import { clearPageMemory, clearPanelMemory, peekPageMemory, rememberPage } from "./kanjiWordsMemory";
import { OperationModal, type OperationSpec } from "./OperationModal";
import { ReviewProgress } from "./ReviewProgress";
import {
  activeFilterCount,
  DEFAULT_FILTERS,
  defaultDir,
  filterKanji,
  parseView,
  serializeView,
  SORT_LABELS,
  sortKanji,
  type KanjiFilters,
  type KanjiView,
  type SortKey,
} from "./kanjiWordsView";

const LIST_PAGE = 100;
// The shell's <main> has p-5 (1.25rem); leaving the same gap under the list and the editor makes the page exactly as
// tall as the window, so only those two scroll, not the page.
const BOTTOM_GAP_PX = 20;
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
  const multiRegion = isMultiRegionEnabled();
  // Kept in memory for the tab: back on the page (from a word's page, say), the list is on screen at once.
  const { data, status, error, meanings, meaningsFailed } = useKanjiWords(multiRegion ? user : null);
  const refetch = reloadKanjiWords;
  const { showToast } = useToast();
  const searchParams = useSearchParams();

  // Read from the URL once; from then on local state is the source of truth and every change is written back
  // with replaceState (a filter tweak shouldn't become a Back step), like the student list.
  const [initialUrl] = useState(() => parseView(new URLSearchParams(searchParams.toString())));
  // What the page left when it was last left on this same view: the rows shown, the ticks, the scroll.
  const [memory] = useState(() => peekPageMemory(serializeView(initialUrl.view, initialUrl.selected)));
  const [view, setView] = useState<KanjiView>(initialUrl.view);
  const [selectedId, setSelectedId] = useState<number | null>(initialUrl.selected);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const closeFilters = useCallback(() => setFiltersOpen(false), []);
  const [limit, setLimit] = useState(memory?.limit ?? LIST_PAGE);
  const [checked, setChecked] = useState<Set<number>>(() => new Set(memory?.checked ?? []));
  const [dirty, setDirty] = useState(false);
  // Waiting for "discard unsaved edits?": the kanji to open afterwards (null = close the panel).
  const [pendingSelect, setPendingSelect] = useState<{ id: number | null } | null>(null);
  const [operation, setOperation] = useState<OperationSpec | null>(null);
  const [batchesOpen, setBatchesOpen] = useState(false);
  const [parity, setParity] = useState<KanjiWordsParity | null>(null);
  const [now] = useState(() => Date.now());
  const editorRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  // Where the list and the window are scrolled, kept up to date for the page's memory.
  const scrollRef = useRef({ list: memory?.listScroll ?? 0, window: memory?.windowScroll ?? 0 });
  // The page's state as of the last render, for the memory it leaves when it goes.
  const latestRef = useRef({ view, selectedId, limit, checked });
  useEffect(() => {
    latestRef.current = { view, selectedId, limit, checked };
  });

  // Leaving (for a word's page, or anywhere else): what to put back on the way back to this same view. On screen
  // again, the memory it came back with (and the panel's) is used up.
  useEffect(() => {
    clearPageMemory();
    clearPanelMemory();
    const latest = latestRef;
    const scroll = scrollRef.current;
    return () => {
      const { view: leftView, selectedId: leftSelected, limit: leftLimit, checked: leftChecked } = latest.current;
      rememberPage({
        qs: serializeView(leftView, leftSelected),
        limit: leftLimit,
        checked: [...leftChecked],
        listScroll: scroll.list,
        windowScroll: scroll.window,
      });
    };
  }, []);

  useEffect(() => {
    if (!multiRegion) return;
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
  }, [multiRegion]);

  // The phone sheet scrolls as a whole and outlives the kanji in it: a newly picked kanji starts at its top, not where
  // the last one was left. (On a wide screen the editor's card scrolls, and a new kanji brings a new card.) Not when
  // the page opens: the panel may be putting back the scroll it had before a word's page.
  const shownKanjiRef = useRef(selectedId);
  useEffect(() => {
    if (shownKanjiRef.current === selectedId) return;
    shownKanjiRef.current = selectedId;
    if (editorRef.current) editorRef.current.scrollTop = 0;
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
  const selectedRow = useMemo(() => rows.find((r) => r.id === selectedId) ?? null, [rows, selectedId]);
  const editorOpen = selectedRow !== null;

  // On a wide screen the list and the editor each keep their own scroll and reach down to just above the window's
  // bottom from wherever they are right now: lower down at the top of the page, higher once they stick under the
  // header. A fixed height would cut off one end or the other.
  // The first fit is made before the browser paints (a layout effect), so the panel's card already has its height
  // when it puts its scroll back; then the list's scroll and the window's are put back as they were left.
  useLayoutEffect(() => {
    const list = listRef.current;
    const boxes = [list, editorRef.current].filter((el): el is HTMLDivElement => el !== null);
    const wide = window.matchMedia("(min-width: 992px)"); // --breakpoint-lg (app/globals.css)
    const fitNow = () => {
      for (const el of boxes) {
        el.style.maxHeight = wide.matches
          ? `${Math.max(240, window.innerHeight - el.getBoundingClientRect().top - BOTTOM_GAP_PX)}px`
          : "";
      }
    };
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fitNow);
    };
    const scroll = scrollRef.current;
    const onWindowScroll = () => {
      scroll.window = window.scrollY;
      fit();
    };
    const onListScroll = () => {
      if (list) scroll.list = list.scrollTop;
    };
    fitNow();
    if (list) list.scrollTop = scroll.list;
    // After the router's own scroll handling for the navigation, which runs in this same commit.
    const restoreFrame = scroll.window > 0 ? requestAnimationFrame(() => window.scrollTo(0, scroll.window)) : 0;
    window.addEventListener("scroll", onWindowScroll, { passive: true });
    list?.addEventListener("scroll", onListScroll, { passive: true });
    window.addEventListener("resize", fit);
    wide.addEventListener("change", fit);
    return () => {
      cancelAnimationFrame(frame);
      cancelAnimationFrame(restoreFrame);
      window.removeEventListener("scroll", onWindowScroll);
      list?.removeEventListener("scroll", onListScroll);
      window.removeEventListener("resize", fit);
      wide.removeEventListener("change", fit);
    };
  }, []);

  // Below lg the editor is a full-screen sheet with its own scroll; lock the page behind it so there's only one.
  useEffect(() => {
    if (!editorOpen) return;
    const wide = window.matchMedia("(min-width: 992px)"); // --breakpoint-lg (app/globals.css)
    const previousOverflow = document.body.style.overflow;
    const apply = () => {
      document.body.style.overflow = wide.matches ? previousOverflow : "hidden";
    };
    apply();
    wide.addEventListener("change", apply);
    return () => {
      wide.removeEventListener("change", apply);
      document.body.style.overflow = previousOverflow;
    };
  }, [editorOpen]);

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
        <PageHeader
          breadcrumbs={[{ label: "Teacher", href: "/admin" }, { label: "Words per kanji" }]}
          title="Words per kanji"
          subtitle="This page needs the EU/US projects (NEXT_PUBLIC_MULTI_REGION), which hold the kanji-words tables."
        />
      </div>
    );
  }

  return (
    <div>
      <Breadcrumbs items={[{ label: "Teacher", href: "/admin" }, { label: "Words per kanji" }]} />
      <h1 className="sr-only">Words per kanji</h1>

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

      <ReviewProgress rows={rows} loading={status !== "loaded"} />

      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 text-sm text-text-muted">
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
        {/* Sticks just under the sticky 4.25rem header; its height is fitted to the window by the effect above. */}
        <GlassCard
          ref={listRef}
          padding="sm"
          className="overflow-hidden lg:sticky lg:top-[5.25rem] lg:overflow-y-auto"
        >
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
              meanings={meanings}
              meaningsFailed={meaningsFailed}
            />
          ) : null}
        </GlassCard>

        {/* A full-screen sheet on a phone, scrolling as a whole. On a wide screen it sits beside the list and, like it,
            sticks under the header, fitted to the window by the effect above; there the editor's card shrinks into it
            and scrolls itself, so its rounded corners and its scrollbar stay inside the card. */}
        <div
          ref={editorRef}
          className={
            selectedRow
              ? "fixed inset-0 z-[120] overflow-y-auto overscroll-contain bg-bg-main p-4 lg:sticky lg:top-[5.25rem] lg:right-auto lg:bottom-auto lg:left-auto lg:z-auto lg:flex lg:flex-col lg:overflow-visible lg:bg-transparent lg:p-0"
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

      {/* Search, sorting, the filters and the bulk tools all sit behind one round button that floats at the bottom
          right of the kanji list while the page scrolls: the whole width on a phone, the list's 26rem column beside the
          editor (whose own circles hold the far right) on a wide screen. The zero-height sticky strip keeps it out of
          the flow, so the card grows upwards over the list instead of pushing the page down. */}
      <div className="pointer-events-none sticky bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 h-0 lg:bottom-10">
        <div data-floating-dock className="absolute bottom-0 left-0 right-0 flex flex-col items-end pr-5 lg:right-auto lg:w-[26rem]">
          <FloatingCard
            label="Filters"
            icon={<FaSliders className="h-4 w-4" />}
            count={filterCount + (view.query.trim() ? 1 : 0)}
            countNoun="active filter"
            widthClassName="max-w-2xl"
            open={filtersOpen}
            onOpen={() => setFiltersOpen(true)}
            onClose={closeFilters}
          >
            {/* Above the scrolling part, so the "Bulk actions" menu can open over it instead of being cut off. */}
            <div className="relative z-10 flex flex-wrap items-center gap-2.5">
              <input
                type="search"
                value={view.query}
                onChange={(e) => updateView({ ...view, query: e.target.value })}
                placeholder="Search a kanji, reading, meaning or word…"
                className="min-w-0 w-full rounded-xl border border-border-soft bg-bg-cards px-4 py-2.5 text-sm outline-none placeholder:text-text-muted focus:border-accent-red/50"
              />
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
              {filterCount > 0 ? (
                <button
                  type="button"
                  onClick={() => updateView({ ...view, filters: DEFAULT_FILTERS })}
                  className="cursor-pointer px-1 text-[0.85rem] font-bold text-text-muted hover:text-white"
                >
                  Reset filters
                </button>
              ) : null}
            </div>
            <div className="@container max-h-[calc(100dvh-20rem)] overflow-y-auto overscroll-contain border-t border-border-soft pt-3">
              <FilterPanel filters={view.filters} onChange={handleFilterChange} adminOptions={adminOptions} />
            </div>
          </FloatingCard>
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
