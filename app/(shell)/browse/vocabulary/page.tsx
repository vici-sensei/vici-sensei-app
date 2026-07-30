import Link from "next/link";
import { fetchServer } from "@/lib/api/server";
import type { VocabularyListResponse, StudySettings } from "@/lib/types";
import { JLPT_LEVELS, type JlptLevel } from "@/lib/srs/constants";
import { BrowseTabs } from "../BrowseTabs";
import { BrowseControls } from "../BrowseControls";
import { Button, buttonClasses } from "@/app/components/ui/Button";
import { FaMagnifyingGlass } from "react-icons/fa6";

const PAGE_SIZE = 50;

interface PageProps {
  searchParams: Promise<{ search?: string; level?: string; offset?: string }>;
}

function parseLevels(raw: string | undefined, fallback: JlptLevel[]): JlptLevel[] {
  if (raw === undefined) return fallback;
  if (raw === "") return [];
  return raw.split(",").filter((l): l is JlptLevel => (JLPT_LEVELS as readonly string[]).includes(l));
}

export default async function BrowseVocabularyPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const settings = await fetchServer<StudySettings>("/api/study-settings");
  const levels = parseLevels(params.level, settings.enabled_levels);
  const search = params.search ?? "";
  const offset = Math.max(Number(params.offset) || 0, 0);

  const query = new URLSearchParams();
  if (search) query.set("search", search);
  if (levels.length > 0) query.set("level", levels.join(","));
  query.set("limit", String(PAGE_SIZE));
  query.set("offset", String(offset));

  const result = await fetchServer<VocabularyListResponse>(`/api/vocabulary?${query.toString()}`);

  const basePath = "/browse/vocabulary";
  const preservedParams = new URLSearchParams();
  if (search) preservedParams.set("search", search);
  if (params.level !== undefined) preservedParams.set("level", params.level);

  function pageHref(newOffset: number) {
    const p = new URLSearchParams(preservedParams);
    if (newOffset > 0) p.set("offset", String(newOffset));
    const qs = p.toString();
    return qs ? `${basePath}?${qs}` : basePath;
  }

  const totalPages = Math.max(1, Math.ceil(result.count / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  return (
    <div>
      <BrowseTabs active="vocabulary" />
      <BrowseControls
        initialSearch={search}
        initialLevels={levels}
        basePath={basePath}
        placeholder="Search by word, reading, or meaning..."
      />

      <div className="mt-6 mb-3.5 text-[0.8rem] font-extrabold uppercase tracking-[1.2px] text-text-muted">Results</div>

      {result.data.length === 0 ? (
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
                href={`/browse/vocabulary/${row.id}`}
                className="flex cursor-pointer items-center gap-4.5 rounded-2xl border border-border-soft bg-bg-cards px-5 py-4 backdrop-blur-[10px] transition-[transform,border-color] duration-200 hover:translate-x-1 hover:border-white/15"
              >
                <div className="w-auto min-w-13 shrink-0 text-[1.3rem] font-extrabold">{row.word}</div>
                <div className="min-w-0 flex-1">
                  <div className="mb-0.5 text-[1.05rem] font-bold">{row.meanings?.join(", ")}</div>
                  <div className="text-[0.85rem] text-text-muted">{row.kana_reading}</div>
                </div>
                <div className="shrink-0 rounded-lg border border-accent-red/30 bg-accent-red/10 px-2.5 py-1 text-[0.72rem] font-extrabold text-accent-red">
                  {row.jlpt_level ?? "—"}
                </div>
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
              Page {currentPage} of {totalPages} &nbsp;·&nbsp; {result.count} results
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
