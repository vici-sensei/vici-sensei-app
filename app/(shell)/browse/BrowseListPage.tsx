"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { JLPT_LEVELS, type JlptLevel } from "@/lib/srs/constants";
import { readStoredLevels } from "@/lib/browse/levelsStorage";
import { readStoredSearch } from "@/lib/browse/searchStorage";
import { createHoverIntent } from "@/lib/browse/hoverIntent";
import { BrowseTabs } from "./BrowseTabs";
import { BrowseControls } from "./BrowseControls";
import { Button, buttonClasses } from "@/app/components/ui/Button";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { FaArrowLeft, FaArrowRight, FaMagnifyingGlass } from "react-icons/fa6";
import type { AsyncStatus } from "@/lib/types";

const PAGE_SIZE = 50;
const PLACEHOLDER_ROW_COUNT = 6;

function parseLevels(raw: string | null, fallback: JlptLevel[]): JlptLevel[] {
  if (raw === null) return fallback;
  if (raw === "") return [];
  return raw.split(",").filter((l): l is JlptLevel => (JLPT_LEVELS as readonly string[]).includes(l));
}

export function ListSkeleton() {
  return (
    <div className="mb-6 flex flex-col gap-2.5">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-[72px] rounded-2xl" />
      ))}
    </div>
  );
}

interface BrowseListPageProps<T> {
  active: "kanji" | "vocabulary";
  basePath: string;
  searchPlaceholder: string;
  useList: (params: {
    search: string | null;
    levels: JlptLevel[];
    limit: number;
    offset: number;
  }) => { data: { data: T[]; count: number } | null; status: AsyncStatus };
  prefetchDetail: (id: number) => void;
  itemKey: (item: T) => number;
  detailHref: (item: T) => string;
  renderRow: (item: T) => ReactNode;
  /** When set, shown as a handful of fake rows (each field its own skeleton) in place of the
   * default full-row ListSkeleton while the first page of real data hasn't landed yet. Receives
   * the row index so placeholders can vary (e.g. word width) instead of repeating identically. */
  renderPlaceholderRow?: (index: number) => ReactNode;
}

function BrowseListResults<T>({
  active,
  basePath,
  searchPlaceholder,
  useList,
  prefetchDetail,
  itemKey,
  detailHref,
  renderRow,
  renderPlaceholderRow,
  search,
  levels,
  rawLevel,
  offset,
}: BrowseListPageProps<T> & { search: string; levels: JlptLevel[]; rawLevel: string | null; offset: number }) {
  const { data: result, status } = useList({ search: search || null, levels, limit: PAGE_SIZE, offset });
  const isInitialLoading = (status === "loading" || !result) && !!renderPlaceholderRow;

  const preservedParams = new URLSearchParams();
  if (search) preservedParams.set("search", search);
  if (rawLevel !== null) preservedParams.set("level", rawLevel);

  function pageHref(newOffset: number) {
    const p = new URLSearchParams(preservedParams);
    if (newOffset > 0) p.set("offset", String(newOffset));
    const qs = p.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  return (
    <div>
      <BrowseTabs active={active} />
      <BrowseControls initialSearch={search} initialLevels={levels} basePath={basePath} placeholder={searchPlaceholder} />

      <div className="mt-6 mb-3.5 text-[0.8rem] font-extrabold uppercase tracking-[1.2px] text-text-muted text-center md:text-start">
        Results
      </div>

      {status === "loading" || !result ? (
        renderPlaceholderRow ? (
          <div className="mb-6 flex flex-col gap-2.5">
            {Array.from({ length: PLACEHOLDER_ROW_COUNT }).map((_, i) => (
              <div
                key={i}
                className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-2xl border border-border-soft bg-bg-cards px-5 py-4 backdrop-blur-[10px]"
              >
                {renderPlaceholderRow(i)}
              </div>
            ))}
          </div>
        ) : (
          <ListSkeleton />
        )
      ) : result.data.length === 0 ? (
        <div className="px-5 py-15 text-center text-text-muted">
          <div className="mx-auto mb-4.5 flex h-15 w-15 items-center justify-center rounded-full border border-border-soft bg-white/[0.04] [&>svg]:h-6.5 [&>svg]:w-6.5">
            <FaMagnifyingGlass />
          </div>
          <h3 className="mb-2 text-[1.15rem] text-white">No results{search ? ` for "${search}"` : ""}</h3>
          <p>Try a different character, reading, or meaning — or adjust the JLPT level filter.</p>
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-col gap-2.5">
            {result.data.map((row) => (
              <Link
                key={itemKey(row)}
                href={detailHref(row)}
                className="flex flex-wrap cursor-pointer items-center gap-x-8 gap-y-2 rounded-2xl border border-border-soft bg-bg-cards px-5 py-4 backdrop-blur-[10px] transition-[transform,border-color] duration-200 hover:translate-x-1 hover:border-white/15"
                {...createHoverIntent(() => prefetchDetail(itemKey(row)))}
              >
                {renderRow(row)}
              </Link>
            ))}
          </div>

          <div className="flex items-center justify-center gap-3.5">
            {offset > 0 ? (
              <Link
                className={buttonClasses({ variant: "secondary", size: "sm", hover: "hover" })}
                href={pageHref(Math.max(0, offset - PAGE_SIZE))}
                aria-label="Previous"
              >
                <FaArrowLeft className="md:hidden" />
                <span className="hidden md:inline">← Previous</span>
              </Link>
            ) : (
              <Button variant="secondary" size="sm" disabled aria-label="Previous">
                <FaArrowLeft className="md:hidden" />
                <span className="hidden md:inline">← Previous</span>
              </Button>
            )}
            <div className="text-[0.85rem] font-semibold text-text-muted flex flex-col md:flex-row items-center gap-0.5 md:gap-1.5">
              <div>
                Page {Math.floor(offset / PAGE_SIZE) + 1} of {Math.max(1, Math.ceil(result.count / PAGE_SIZE))}
              </div>
              <div className="hidden md:block">·</div>
              <div>{result.count} results</div>
            </div>
            {offset + PAGE_SIZE < result.count ? (
              <Link
                className={buttonClasses({ variant: "secondary", size: "sm", hover: "hover" })}
                href={pageHref(offset + PAGE_SIZE)}
                aria-label="Next"
              >
                <FaArrowRight className="md:hidden" />
                <span className="hidden md:inline">Next →</span>
              </Link>
            ) : (
              <Button variant="secondary" size="sm" disabled aria-label="Next">
                <FaArrowRight className="md:hidden" />
                <span className="hidden md:inline">Next →</span>
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function BrowseListPage<T>(props: BrowseListPageProps<T>) {
  const searchParams = useSearchParams();

  const search = searchParams.get("search") ?? readStoredSearch();
  const rawLevel = searchParams.get("level");
  const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);

  return (
    <BrowseListResults
      {...props}
      search={search}
      levels={parseLevels(rawLevel, readStoredLevels())}
      rawLevel={rawLevel}
      offset={offset}
    />
  );
}
