"use client";

import { Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useStudySettings } from "@/lib/client-data/studySettings";
import { useKanjiList } from "@/lib/client-data/kanji";
import { JLPT_LEVELS, type JlptLevel } from "@/lib/srs/constants";
import { BrowseTabs } from "../BrowseTabs";
import { BrowseControls } from "../BrowseControls";
import { Button, buttonClasses } from "@/app/components/ui/Button";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { FaMagnifyingGlass } from "react-icons/fa6";

const PAGE_SIZE = 50;

function parseLevels(raw: string | null, fallback: JlptLevel[]): JlptLevel[] {
  if (raw === null) return fallback;
  if (raw === "") return [];
  return raw.split(",").filter((l): l is JlptLevel => (JLPT_LEVELS as readonly string[]).includes(l));
}

function BrowseKanjiListing() {
  const { user } = useAuth();
  const { data: settings, status: settingsStatus } = useStudySettings(user);
  const searchParams = useSearchParams();

  const search = searchParams.get("search") ?? "";
  const rawLevel = searchParams.get("level");
  const offset = Math.max(Number(searchParams.get("offset")) || 0, 0);

  if (settingsStatus === "loading" || !settings) {
    return <ListSkeleton />;
  }

  return (
    <BrowseKanjiResults
      search={search}
      levels={parseLevels(rawLevel, settings.enabled_levels)}
      rawLevel={rawLevel}
      offset={offset}
    />
  );
}

function BrowseKanjiResults({
  search,
  levels,
  rawLevel,
  offset,
}: {
  search: string;
  levels: JlptLevel[];
  rawLevel: string | null;
  offset: number;
}) {
  const { data: result, status } = useKanjiList({ search: search || null, levels, limit: PAGE_SIZE, offset });

  const basePath = "/browse/kanji";
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
      <BrowseTabs active="kanji" />
      <BrowseControls
        initialSearch={search}
        initialLevels={levels}
        basePath={basePath}
        placeholder="Search by character, reading, or meaning..."
      />

      <div className="mt-6 mb-3.5 text-[0.8rem] font-extrabold uppercase tracking-[1.2px] text-text-muted">Results</div>

      {status === "loading" || !result ? (
        <ListSkeleton />
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
                key={row.id}
                href={`/browse/kanji/detail?id=${row.id}`}
                className="flex cursor-pointer items-center gap-4.5 rounded-2xl border border-border-soft bg-bg-cards px-5 py-4 backdrop-blur-[10px] transition-[transform,border-color] duration-200 hover:translate-x-1 hover:border-white/15"
              >
                <div className="w-13 shrink-0 text-[1.9rem] font-extrabold">{row.kanji}</div>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 text-[1.05rem] font-bold">{row.meanings?.join(", ")}</div>
                  <div className="text-[0.85rem] text-text-muted">
                    kun: {row.kun_readings?.join("、") || "—"} &nbsp;·&nbsp; on: {row.on_readings?.join("、") || "—"}
                  </div>
                </div>
                <LevelBadge level={row.level} className="shrink-0" />
              </Link>
            ))}
          </div>

          <div className="flex items-center justify-center gap-3.5">
            {offset > 0 ? (
              <Link className={buttonClasses({ variant: "secondary", size: "sm", hover: "hover" })} href={pageHref(Math.max(0, offset - PAGE_SIZE))}>
                ← Previous
              </Link>
            ) : (
              <Button variant="secondary" size="sm" disabled>
                ← Previous
              </Button>
            )}
            <span className="text-[0.85rem] font-semibold text-text-muted">
              Page {Math.floor(offset / PAGE_SIZE) + 1} of {Math.max(1, Math.ceil(result.count / PAGE_SIZE))} &nbsp;·&nbsp;{" "}
              {result.count} results
            </span>
            {offset + PAGE_SIZE < result.count ? (
              <Link className={buttonClasses({ variant: "secondary", size: "sm", hover: "hover" })} href={pageHref(offset + PAGE_SIZE)}>
                Next →
              </Link>
            ) : (
              <Button variant="secondary" size="sm" disabled>
                Next →
              </Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="mb-6 flex flex-col gap-2.5">
      {Array.from({ length: 6 }).map((_, i) => (
        <Skeleton key={i} className="h-[72px] rounded-2xl" />
      ))}
    </div>
  );
}

export default function BrowseKanjiPage() {
  return (
    <Suspense fallback={<ListSkeleton />}>
      <BrowseKanjiListing />
    </Suspense>
  );
}
