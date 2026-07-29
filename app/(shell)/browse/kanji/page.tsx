import Link from "next/link";
import { fetchServer } from "@/lib/api/server";
import type { KanjiListResponse, StudySettings } from "@/lib/types";
import { JLPT_LEVELS, type JlptLevel } from "@/lib/srs/constants";
import { BrowseTabs } from "../BrowseTabs";
import { BrowseControls } from "../BrowseControls";

const PAGE_SIZE = 50;

interface PageProps {
  searchParams: Promise<{ search?: string; level?: string; offset?: string }>;
}

function parseLevels(raw: string | undefined, fallback: JlptLevel[]): JlptLevel[] {
  if (raw === undefined) return fallback;
  if (raw === "") return [];
  return raw.split(",").filter((l): l is JlptLevel => (JLPT_LEVELS as readonly string[]).includes(l));
}

export default async function BrowseKanjiPage({ searchParams }: PageProps) {
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

  const result = await fetchServer<KanjiListResponse>(`/api/kanji?${query.toString()}`);

  const basePath = "/browse/kanji";
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
      <BrowseTabs active="kanji" />
      <BrowseControls
        initialSearch={search}
        initialLevels={levels}
        basePath={basePath}
        placeholder="Search by character, reading, or meaning..."
      />

      <div className="section-title" style={{ marginTop: 24 }}>
        Results
      </div>

      {result.data.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon-wrap">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </div>
          <h3>No results{search ? ` for "${search}"` : ""}</h3>
          <p>Try a different character, reading, or meaning — or adjust the JLPT level filter.</p>
        </div>
      ) : (
        <>
          <div className="result-list">
            {result.data.map((row) => (
              <Link key={row.id} href={`/browse/kanji/${row.id}`} className="result-row">
                <div className="result-char">{row.kanji}</div>
                <div className="result-word-block">
                  <div className="result-main">{row.meanings?.join(", ")}</div>
                  <div className="result-sub">
                    kun: {row.kun_readings?.join("、") || "—"} &nbsp;·&nbsp; on: {row.on_readings?.join("、") || "—"}
                  </div>
                </div>
                <div className="lvl-badge">{row.level ?? "—"}</div>
              </Link>
            ))}
          </div>

          <div className="pagination">
            {offset > 0 ? (
              <Link className="btn-secondary btn-sm" href={pageHref(Math.max(0, offset - PAGE_SIZE))}>
                ← Previous
              </Link>
            ) : (
              <button type="button" className="btn-secondary btn-sm" disabled>
                ← Previous
              </button>
            )}
            <span>
              Page {currentPage} of {totalPages} &nbsp;·&nbsp; {result.count} results
            </span>
            {offset + PAGE_SIZE < result.count ? (
              <Link className="btn-secondary btn-sm" href={pageHref(offset + PAGE_SIZE)}>
                Next →
              </Link>
            ) : (
              <button type="button" className="btn-secondary btn-sm" disabled>
                Next →
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
