"use client";

import { Suspense, useDeferredValue, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { FaChevronLeft, FaChevronRight, FaSliders, FaSort, FaSortDown, FaSortUp } from "react-icons/fa6";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useAllWords } from "@/lib/client-data/adminWords";
import { buildFuriganaSegments, renderVocabularyWord, showsKanaOnly } from "@/lib/study/furigana";
import { Collapsible } from "@/app/components/ui/Collapsible";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { PageHeader } from "@/app/components/ui/PageHeader";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { FilterPanel } from "./FilterPanel";
import {
  activeFilterCount,
  DEFAULT_FILTERS,
  DEFAULT_SORT,
  defaultDir,
  isDefaultFilters,
  parseView,
  partOfSpeechOptions,
  serializeView,
  toEntries,
  visibleEntries,
  type SortKey,
  type WordEntry,
  type WordFilters,
  type WordsView,
} from "./wordsView";

const PAGE_SIZE = 100;

const COLUMNS: { key: string; label: string; sort?: SortKey }[] = [
  { key: "word", label: "Word", sort: "word" },
  { key: "meaning", label: "Meaning", sort: "meaning" },
  { key: "level", label: "Level", sort: "level" },
  { key: "tags", label: "Tags" },
];

function SortableHeader({
  label,
  sortKey,
  view,
  onSort,
}: {
  label: string;
  sortKey: SortKey;
  view: WordsView;
  onSort: (key: SortKey) => void;
}) {
  const active = view.sort === sortKey;
  const Icon = !active ? FaSort : view.dir === "asc" ? FaSortUp : FaSortDown;
  return (
    <th
      className="px-3 py-2.5 font-semibold"
      aria-sort={active ? (view.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap transition-colors hover:text-white ${
          active ? "text-white" : ""
        }`}
      >
        {label}
        <Icon className={`h-3 w-3 ${active ? "text-accent-blue" : "opacity-40"}`} />
      </button>
    </th>
  );
}

function Tag({ className, title, children }: { className: string; title: string; children: ReactNode }) {
  return (
    <span title={title} className={`rounded-md border px-1.5 py-0.5 text-[0.65rem] font-extrabold whitespace-nowrap ${className}`}>
      {children}
    </span>
  );
}

function WordRow({ entry }: { entry: WordEntry }) {
  const w = entry.row;
  const short = w.short_meaning?.trim();
  // The reading is the furigana above the kanji, or the word itself for a usually-kana word (shown in kana).
  // Only a word whose furigana is missing or doesn't line up with it gets its reading on a line below.
  const hasFurigana = !showsKanaOnly(w) && buildFuriganaSegments(w.word, w.furiganas).some((s) => s.furigana);
  const kana = !showsKanaOnly(w) && !hasFurigana && w.kana_reading !== w.word ? w.kana_reading : null;
  return (
    // Baseline, not top: the other cells line up with the kanji instead of the furigana above them.
    <tr className="border-b border-border-soft/50 align-baseline last:border-0 hover:bg-white/[0.03]">
      <td className="px-3 py-2.5">
        <div className={`whitespace-nowrap text-lg font-bold leading-snug ${hasFurigana ? "pt-[0.6em]" : ""}`}>
          {renderVocabularyWord(w, "text-xs font-normal text-text-muted")}
        </div>
        {kana ? <div className="text-xs text-text-muted">{kana}</div> : null}
      </td>
      <td className="max-w-[24rem] px-3 py-2.5">
        <div className="line-clamp-2">
          {short ? (
            <span className="mr-1.5 rounded-md border border-accent-gold/30 bg-accent-gold/10 px-1.5 font-bold text-accent-gold">
              {short}
            </span>
          ) : null}
          {entry.primaryText || (short ? null : <span className="text-text-muted">—</span>)}
        </div>
      </td>
      <td className="px-3 py-2.5">
        <LevelBadge level={w.jlpt_level} size="sm" />
      </td>
      <td className="px-3 py-2.5">
        <div className="flex flex-wrap gap-1">
          {w.is_common_jisho ? (
            <Tag className="border-green-400/30 bg-green-400/10 text-green-400" title="Marked common on Jisho">
              Common
            </Tag>
          ) : null}
          {w.usually_kana ? (
            <Tag className="border-blue-400/30 bg-blue-400/10 text-blue-400" title={`Usually written in kana (kanji: ${w.word})`}>
              Kana
            </Tag>
          ) : null}
          {!w.study_enabled ? (
            <Tag className="border-accent-red/30 bg-accent-red/10 text-accent-red" title="Not enabled for study">
              Not studied
            </Tag>
          ) : null}
        </div>
      </td>
    </tr>
  );
}

function PageButton({ onClick, disabled, label, children }: { onClick: () => void; disabled: boolean; label: string; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-border-soft bg-white/[0.03] text-text-muted transition-all hover:border-white/20 hover:text-white disabled:cursor-default disabled:opacity-40 disabled:hover:border-border-soft disabled:hover:text-text-muted"
    >
      {children}
    </button>
  );
}

function AdminWords() {
  const { user } = useAuth();
  const { data: words, status } = useAllWords(user);
  const searchParams = useSearchParams();
  const countRef = useRef<HTMLParagraphElement>(null);

  // Read from the URL once; from then on local state is the source of truth and each change is
  // written back with replaceState (not pushState -- a filter tweak shouldn't become a Back step).
  const [view, setView] = useState<WordsView>(() => parseView(new URLSearchParams(searchParams.toString())));
  const [filtersOpen, setFiltersOpen] = useState(() => !isDefaultFilters(view.filters));
  // Filtering and sorting 17k words is the slow part of a keystroke; deferring it keeps the search box responsive.
  const deferredView = useDeferredValue(view);

  const entries = useMemo(() => toEntries(words ?? []), [words]);
  const partsOfSpeech = useMemo(() => partOfSpeechOptions(entries), [entries]);
  const visible = useMemo(() => visibleEntries(entries, deferredView), [entries, deferredView]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const page = Math.min(deferredView.page, pageCount);
  const pageRows = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function updateView(next: WordsView) {
    setView(next);
    const qs = serializeView(next);
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }

  // First click sorts by the column, the second flips it, the third goes back to the default order (most
  // frequent first), which has no column to click.
  function handleSort(key: SortKey) {
    if (view.sort === key && view.dir !== defaultDir(key)) {
      updateView({ ...view, sort: DEFAULT_SORT, dir: defaultDir(DEFAULT_SORT), page: 1 });
      return;
    }
    const dir = view.sort === key ? (view.dir === "asc" ? "desc" : "asc") : defaultDir(key);
    updateView({ ...view, sort: key, dir, page: 1 });
  }

  function handleFilterChange(patch: Partial<WordFilters>) {
    updateView({ ...view, filters: { ...view.filters, ...patch }, page: 1 });
  }

  function goToPage(next: number) {
    updateView({ ...view, page: next });
    countRef.current?.scrollIntoView({ block: "start" });
  }

  const filterCount = activeFilterCount(view.filters);
  const first = (page - 1) * PAGE_SIZE + 1;
  const last = Math.min(page * PAGE_SIZE, visible.length);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Teacher", href: "/admin" }, { label: "All words" }]}
        title="All words"
        subtitle="Every word in the dictionary, including the ones not enabled for study."
        compact
      />

      <div className="flex flex-wrap items-center gap-2.5">
        <input
          type="text"
          value={view.query}
          onChange={(e) => updateView({ ...view, query: e.target.value, page: 1 })}
          placeholder="Search by word, reading, romaji or meaning..."
          aria-label="Search words"
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
        {!isDefaultFilters(view.filters) ? (
          <button
            type="button"
            onClick={() => updateView({ ...view, filters: DEFAULT_FILTERS, page: 1 })}
            className="cursor-pointer px-1 text-[0.85rem] font-bold text-text-muted hover:text-white"
          >
            Reset
          </button>
        ) : null}
      </div>

      <Collapsible open={filtersOpen} openClassName="mt-4">
        <GlassCard padding="sm">
          <FilterPanel filters={view.filters} onChange={handleFilterChange} partsOfSpeech={partsOfSpeech} />
        </GlassCard>
      </Collapsible>

      <p ref={countRef} className="mt-4 mb-2.5 scroll-mt-4 text-sm text-text-muted">
        {status === "loaded"
          ? visible.length === 0
            ? `No words out of ${entries.length.toLocaleString()}`
            : `Showing ${first.toLocaleString()}–${last.toLocaleString()} of ${visible.length.toLocaleString()} words${
                visible.length < entries.length ? ` (${entries.length.toLocaleString()} in total)` : ""
              }`
          : " "}
      </p>

      <GlassCard padding="sm" className="overflow-x-auto">
        <table className="w-full min-w-200 break-words text-left text-sm">
          <thead>
            <tr className="border-b border-border-soft text-text-muted">
              {COLUMNS.map((column) =>
                column.sort ? (
                  <SortableHeader key={column.key} label={column.label} sortKey={column.sort} view={view} onSort={handleSort} />
                ) : (
                  <th key={column.key} className="whitespace-nowrap px-3 py-2.5 font-semibold">
                    {column.label}
                  </th>
                )
              )}
            </tr>
          </thead>
          <tbody>
            {status === "loading" &&
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b border-border-soft/50">
                  <td className="px-3 py-3" colSpan={COLUMNS.length}>
                    <Skeleton className="h-5 w-full" />
                  </td>
                </tr>
              ))}
            {status === "error" && (
              <tr>
                <td className="px-3 py-6 text-center text-text-muted" colSpan={COLUMNS.length}>
                  Failed to load the words.
                </td>
              </tr>
            )}
            {status === "loaded" && visible.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-text-muted" colSpan={COLUMNS.length}>
                  {entries.length === 0 ? "The dictionary is empty." : "No words match this search and these filters."}
                </td>
              </tr>
            )}
            {status === "loaded" && pageRows.map((entry) => <WordRow key={entry.row.id} entry={entry} />)}
          </tbody>
        </table>
      </GlassCard>

      {status === "loaded" && pageCount > 1 ? (
        <div className="mt-4 flex items-center justify-center gap-3 text-sm text-text-muted">
          <PageButton onClick={() => goToPage(page - 1)} disabled={page <= 1} label="Previous page">
            <FaChevronLeft className="h-3 w-3" />
          </PageButton>
          <span className="tabular-nums">
            Page {page} of {pageCount}
          </span>
          <PageButton onClick={() => goToPage(page + 1)} disabled={page >= pageCount} label="Next page">
            <FaChevronRight className="h-3 w-3" />
          </PageButton>
        </div>
      ) : null}
    </div>
  );
}

export default function AdminWordsPage() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <AdminWords />
    </Suspense>
  );
}
