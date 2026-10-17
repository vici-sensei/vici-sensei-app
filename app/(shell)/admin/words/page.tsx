"use client";

import { Suspense, useDeferredValue, useEffect, useMemo, useRef, useState, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FaChevronLeft, FaChevronRight, FaPencil, FaSliders, FaSort, FaSortDown, FaSortUp } from "react-icons/fa6";
import { useAuth } from "@/lib/auth/AuthProvider";
import { setCachedReview, useAllWords } from "@/lib/client-data/adminWords";
import { describeKanjiWordsError, setVocabularyReviewed } from "@/lib/data/adminKanjiWords";
import { createClient } from "@/lib/supabase/client";
import { isMultiRegionEnabled } from "@/lib/supabase/regions";
import { buildFuriganaSegments, renderVocabularyWord, showsKanaOnly } from "@/lib/study/furigana";
import { OtherMeaningsToggle } from "@/app/components/browse/OtherMeaningsToggle";
import { Collapsible } from "@/app/components/ui/Collapsible";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { PageHeader } from "@/app/components/ui/PageHeader";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { useToast } from "@/app/components/ui/Toast";
import type { AdminWordRow, VocabularyReviewMark } from "@/lib/types";
import { applyWordReview } from "../kanji-words/kanjiWordsMemory";
import { ReviewedToggle } from "../kanji-words/ReviewedToggle";
import { formatWhen } from "../kanji-words/wordLabels";
import { FilterPanel } from "./FilterPanel";
import {
  activeFilterCount,
  DEFAULT_FILTERS,
  clearOpened,
  DEFAULT_SORT,
  defaultDir,
  entriesOf,
  isDefaultFilters,
  listKeyOf,
  PAGE_SIZE,
  pageOf,
  parseView,
  peekOpened,
  rememberOrder,
  serializeView,
  visibleEntries,
  type SortKey,
  type WordEntry,
  type WordFilters,
  type WordsView,
} from "./wordsView";

// On a phone (below md, where the side nav goes away too) the table is only Word + Meaning, so it fits the
// screen instead of scrolling sideways: the level and the tags move under the word (see WordRow) and the
// Level sort moves into the Word header.
const WIDE_ONLY = "max-md:hidden";

interface Column {
  key: string;
  label: string;
  sort?: SortKey;
  className?: string;
}

const COLUMNS: Column[] = [
  { key: "word", label: "Word", sort: "word" },
  { key: "meaning", label: "Meaning", sort: "meaning" },
  { key: "level", label: "Level", sort: "level", className: WIDE_ONLY },
  { key: "tags", label: "Tags", className: WIDE_ONLY },
];

// The reviewed mark's and the pencil's column: no header text, as narrow as the buttons.
const EDIT_COLUMN: Column = { key: "edit", label: "", className: "w-px" };

function SortButton({
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
  );
}

function SortableHeader({
  label,
  sortKey,
  view,
  onSort,
  className = "",
  children,
}: {
  label: string;
  sortKey: SortKey;
  view: WordsView;
  onSort: (key: SortKey) => void;
  className?: string;
  children?: ReactNode;
}) {
  const active = view.sort === sortKey;
  return (
    <th
      className={`px-3 py-2.5 font-semibold ${className}`}
      aria-sort={active ? (view.dir === "asc" ? "ascending" : "descending") : "none"}
    >
      <SortButton label={label} sortKey={sortKey} view={view} onSort={onSort} />
      {children}
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

const reviewedTitle = (review: VocabularyReviewMark) =>
  `Reviewed by ${review.by ?? "an unknown admin"} · ${formatWhen(review.at)}`;

// Most words are common, so only the exceptions get a tag. No tag for usually-kana words: the Word column
// already shows them in kana.
function WordTags({ w, review }: { w: WordEntry["row"]; review: VocabularyReviewMark | undefined }) {
  return (
    <>
      {review ? (
        <Tag className="border-accent-green/30 bg-accent-green/10 text-accent-green" title={reviewedTitle(review)}>
          Reviewed
        </Tag>
      ) : null}
      {!w.is_common_jisho ? (
        <Tag className="border-orange-400/30 bg-orange-400/10 text-orange-400" title="Not marked common on Jisho">
          Uncommon
        </Tag>
      ) : null}
      {!w.study_enabled ? (
        <Tag className="border-accent-red/30 bg-accent-red/10 text-accent-red" title="Not enabled for study">
          Not studied
        </Tag>
      ) : null}
    </>
  );
}

function WordRow({
  entry,
  review,
  editHref,
  onEdit,
  reviewBusy,
  onToggleReviewed,
  flash,
}: {
  entry: WordEntry;
  review: VocabularyReviewMark | undefined;
  /** The word's page (the pencil); null when words can't be edited here. */
  editHref: string | null;
  onEdit: () => void;
  /** The reviewed mark is being written. */
  reviewBusy: boolean;
  /** Sets or takes away the reviewed mark (the check beside the pencil); null when the marks couldn't be read. */
  onToggleReviewed: (() => void) | null;
  /** The word whose page was open last: the row lights up for a moment when the list comes back. */
  flash: boolean;
}) {
  const w = entry.row;
  const short = w.short_meaning?.trim();
  // The reading is the furigana above the kanji, or the word itself for a usually-kana word (shown in kana).
  // Only a word whose furigana is missing or doesn't line up with it gets its reading on a line below.
  const hasFurigana = !showsKanaOnly(w) && buildFuriganaSegments(w.word, w.furiganas).some((s) => s.furigana);
  const kana = !showsKanaOnly(w) && !hasFurigana && w.kana_reading !== w.word ? w.kana_reading : null;
  const router = useRouter();
  // A press anywhere on the row opens the word, like the pencil: not one on the row's buttons, and not the end of a
  // drag that selected text (to copy a meaning). Ctrl/⌘-click opens a new tab only from the pencil.
  function openFromRow(e: MouseEvent<HTMLTableRowElement>) {
    if (!editHref || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (e.target instanceof Element && e.target.closest("a, button, input")) return;
    if (window.getSelection()?.isCollapsed === false) return;
    onEdit();
    router.push(editHref);
  }
  return (
    // Top, not baseline: lined up with the kanji, the meaning of a word with furigana started a furigana's
    // height lower than in the other rows, with empty space above it.
    // A reviewed word gets the faint green wash and the green bar on the left that its card has on
    // /admin/kanji-words (the bar on the first cell: a row draws no shadow of its own). The return flash wins.
    <tr
      id={`word-${w.id}`}
      onClick={openFromRow}
      className={`border-b border-border-soft/50 align-top transition-colors duration-700 last:border-0 ${editHref ? "cursor-pointer" : ""} ${
        flash
          ? "bg-accent-blue/[0.12]"
          : review
            ? "bg-accent-green/[0.07] hover:bg-accent-green/[0.1]"
            : "hover:bg-white/[0.03]"
      }`}
    >
      <td className={`px-3 py-2.5 ${review ? "shadow-[inset_3px_0_0_rgba(52,211,153,0.7)]" : ""}`}>
        <div className={`whitespace-nowrap text-lg font-bold leading-snug ${hasFurigana ? "pt-[0.6em]" : ""}`}>
          {renderVocabularyWord(w, "text-xs font-normal text-text-muted")}
        </div>
        {kana ? <div className="text-xs text-text-muted">{kana}</div> : null}
        <div className="mt-1.5 flex flex-wrap gap-1 md:hidden">
          <LevelBadge level={w.jlpt_level} size="sm" />
          <WordTags w={w} review={review} />
        </div>
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
        <OtherMeaningsToggle otherMeanings={w.other_meanings} className="mt-1.5" />
      </td>
      <td className={`px-3 py-2.5 ${WIDE_ONLY}`}>
        <LevelBadge level={w.jlpt_level} size="sm" />
      </td>
      <td className={`px-3 py-2.5 ${WIDE_ONLY}`}>
        <div className="flex flex-wrap gap-1">
          <WordTags w={w} review={review} />
        </div>
      </td>
      {editHref ? (
        // On a phone the check sits above the pencil, so the column stays one button wide.
        <td className="py-1.5 pr-1 pl-0 md:pr-2">
          <div className="flex flex-col md:flex-row">
            {onToggleReviewed ? (
              <ReviewedToggle
                name={w.word}
                reviewed={review !== undefined}
                busy={reviewBusy}
                onToggle={onToggleReviewed}
                title={review ? reviewedTitle(review) : undefined}
              />
            ) : null}
            <Link
              href={editHref}
              onClick={onEdit}
              title="Edit"
              aria-label={`Edit ${w.word}`}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-text-muted transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <FaPencil className="h-3.5 w-3.5" />
            </Link>
          </div>
        </td>
      ) : null}
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
  const { rows: words, reviews, status } = useAllWords(user);
  const { showToast } = useToast();
  const searchParams = useSearchParams();
  const countRef = useRef<HTMLParagraphElement>(null);
  // The word pages need the edit RPCs, which only the EU/US projects have.
  const editable = isMultiRegionEnabled();
  const columns = editable ? [...COLUMNS, EDIT_COLUMN] : COLUMNS;

  // Read from the URL once; from then on local state is the source of truth and each change is
  // written back with replaceState (not pushState -- a filter tweak shouldn't become a Back step), by the
  // effect below.
  const [view, setView] = useState<WordsView>(() => parseView(new URLSearchParams(searchParams.toString())));
  const [filtersOpen, setFiltersOpen] = useState(() => !isDefaultFilters(view.filters));
  // Filtering and sorting 17k words is the slow part of a keystroke; deferring it keeps the search box responsive.
  const deferredView = useDeferredValue(view);

  const entries = useMemo(() => (words ? entriesOf(words) : []), [words]);
  const visible = useMemo(() => visibleEntries(entries, deferredView, reviews), [entries, deferredView, reviews]);

  // Back from a word's page (or after walking through words with its ‹ ›): the list opens on the page of the last
  // word shown there, which lights up for a moment. Worked out once, in the first render that has the list.
  const [returnTo, setReturnTo] = useState(peekOpened);
  const [flashId, setFlashId] = useState<number | null>(null);
  if (returnTo !== null && status === "loaded") {
    setReturnTo(null);
    const index = visible.findIndex((e) => e.row.id === returnTo);
    if (index >= 0) {
      setFlashId(returnTo);
      if (pageOf(index) !== view.page) setView({ ...view, page: pageOf(index) });
    }
  }
  useEffect(() => {
    clearOpened();
  }, []);
  useEffect(() => {
    const qs = serializeView(view);
    if (qs !== window.location.search.slice(1)) window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [view]);
  useEffect(() => {
    if (flashId === null) return;
    const center = () => document.getElementById(`word-${flashId}`)?.scrollIntoView({ block: "center" });
    center();
    // After the browser's Back, it puts the list's old scroll position back once the list is drawn, which can land
    // after this: a moment later the row is centered again if that pushed it out of view.
    const again = setTimeout(() => {
      const box = document.getElementById(`word-${flashId}`)?.getBoundingClientRect();
      if (box && (box.bottom < 80 || box.top > window.innerHeight)) center();
    }, 150);
    const timer = setTimeout(() => setFlashId(null), 1600);
    return () => {
      clearTimeout(again);
      clearTimeout(timer);
    };
  }, [flashId]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const page = Math.min(deferredView.page, pageCount);
  const pageRows = visible.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  // The list as it is now, for the word pages: their "All words" link comes back to it.
  const listQs = serializeView({ ...deferredView, page });

  function updateView(next: WordsView) {
    setView(next);
  }

  // The check beside the pencil: marks the word as reviewed, or takes the mark away, right away (on both regions),
  // like the button on the word's page. Under the "Not reviewed" filter a word marked leaves the list.
  const [reviewBusy, setReviewBusy] = useState<ReadonlySet<number>>(() => new Set());
  async function toggleReviewed(w: AdminWordRow, next: boolean) {
    setReviewBusy((prev) => new Set(prev).add(w.id));
    try {
      const result = await setVocabularyReviewed(createClient(), { vocabularyId: w.id, reviewed: next });
      setCachedReview(w.id, result.reviewed);
      applyWordReview(result);
      showToast(result.changed ? `${next ? "Marked as reviewed" : "Marked as not reviewed"}: ${w.word}.` : "It was already like that.");
    } catch (err) {
      showToast(describeKanjiWordsError(err, "Failed to change the reviewed mark."), "error");
    } finally {
      setReviewBusy((prev) => {
        const rest = new Set(prev);
        rest.delete(w.id);
        return rest;
      });
    }
  }

  // The word page walks through the words in the list's order (its ‹ ›).
  function rememberListOrder() {
    rememberOrder(
      listKeyOf(deferredView),
      visible.map((e) => e.row.id)
    );
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
          <FilterPanel
            filters={view.filters}
            onChange={handleFilterChange}
            reviewsAvailable={status !== "loaded" || reviews !== null}
          />
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

      <GlassCard padding="sm" className="overflow-x-auto max-md:px-1.5 max-md:py-2">
        <table className="w-full break-words text-left text-sm">
          <thead>
            <tr className="border-b border-border-soft align-top text-text-muted">
              {columns.map((column) =>
                column.sort ? (
                  <SortableHeader
                    key={column.key}
                    label={column.label}
                    sortKey={column.sort}
                    view={view}
                    onSort={handleSort}
                    className={column.className}
                  >
                    {/* Under "Word", like the level badge sits under the word in the rows. */}
                    {column.key === "word" ? (
                      <div className="mt-1 md:hidden">
                        <SortButton label="Level" sortKey="level" view={view} onSort={handleSort} />
                      </div>
                    ) : null}
                  </SortableHeader>
                ) : (
                  <th key={column.key} className={`whitespace-nowrap px-3 py-2.5 font-semibold ${column.className ?? ""}`}>
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
                  <td className="px-3 py-3" colSpan={columns.length}>
                    <Skeleton className="h-5 w-full" />
                  </td>
                </tr>
              ))}
            {status === "error" && (
              <tr>
                <td className="px-3 py-6 text-center text-text-muted" colSpan={columns.length}>
                  Failed to load the words.
                </td>
              </tr>
            )}
            {status === "loaded" && visible.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-text-muted" colSpan={columns.length}>
                  {entries.length === 0 ? "The dictionary is empty." : "No words match this search and these filters."}
                </td>
              </tr>
            )}
            {status === "loaded" &&
              pageRows.map((entry) => (
                <WordRow
                  key={entry.row.id}
                  entry={entry}
                  review={reviews?.get(entry.row.id)}
                  editHref={editable ? `/admin/words/edit?id=${entry.row.id}${listQs ? `&${listQs}` : ""}` : null}
                  onEdit={rememberListOrder}
                  reviewBusy={reviewBusy.has(entry.row.id)}
                  onToggleReviewed={
                    reviews ? () => void toggleReviewed(entry.row, !reviews.has(entry.row.id)) : null
                  }
                  flash={flashId === entry.row.id}
                />
              ))}
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
