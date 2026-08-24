"use client";

import { useMemo, useState } from "react";
import { GOJUON_ROW_LABELS, GOJUON_ROW_LAYOUT } from "@/lib/srs/gojuon";
import { BrowseTabs } from "./BrowseTabs";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { scrollWindowToTopOnFocus } from "@/lib/scrollFocus";
import { FaMagnifyingGlass } from "react-icons/fa6";
import type { NewHiraganaCandidate, NewKatakanaCandidate } from "@/lib/types";

type KanaRow = NewHiraganaCandidate | NewKatakanaCandidate;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function matches(row: KanaRow, query: string): boolean {
  if (!query) return true;
  return row.character.includes(query) || normalize(row.romaji).includes(query);
}

interface Props {
  active: "hiragana" | "katakana";
  placeholder: string;
  accentClass: string;
  data: KanaRow[] | null;
  status: "loading" | "loaded" | "error";
}

/** One table per set (mirroring today's Kanji/Vocabulary "one tab = one page = one table"
 * pattern) -- but under 110 characters total, the whole set loads once and this filters it
 * locally/instantly as the student types, rather than a server-side search RPC (not worth it
 * at this size -- see search_kanji/search_vocabulary for what that machinery looks like). */
export function BrowseKanaListPage({ active, placeholder, accentClass, data, status }: Props) {
  const [search, setSearch] = useState("");
  const query = normalize(search);

  const groups = useMemo(() => {
    const rows = (data ?? []).filter((row) => matches(row, query));
    const byRow = new Map<string, KanaRow[]>();
    for (const row of rows) {
      const list = byRow.get(row.gojuon_row);
      if (list) list.push(row);
      else byRow.set(row.gojuon_row, [row]);
    }
    return Array.from(byRow.entries());
  }, [data, query]);

  const isInitialLoading = status === "loading" && !data;

  return (
    <div>
      <BrowseTabs active={active} />

      <div className="mb-5.5 flex flex-wrap gap-3">
        <div className="flex min-w-2 flex-1 items-center gap-2.5 rounded-xl border border-border-soft bg-white/[0.03] px-4 py-3">
          <FaMagnifyingGlass className="h-4 w-4 shrink-0 text-text-muted" />
          <input
            type="text"
            className="min-w-[100px] flex-1 truncate bg-transparent text-[0.95rem] text-white outline-none placeholder:text-text-muted"
            placeholder={placeholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={scrollWindowToTopOnFocus}
          />
        </div>
      </div>

      {isInitialLoading ? (
        <BrowseKanaListSkeleton />
      ) : status === "error" && !data ? (
        <div className="px-5 py-15 text-center text-text-muted">
          <h3 className="mb-2 text-[1.15rem] text-white">Couldn&apos;t load the list</h3>
          <p>Try reloading the page.</p>
        </div>
      ) : groups.length === 0 ? (
        <div className="px-5 py-15 text-center text-text-muted">
          <div className="mx-auto mb-4.5 flex h-15 w-15 items-center justify-center rounded-full border border-border-soft bg-white/[0.04] [&>svg]:h-6.5 [&>svg]:w-6.5">
            <FaMagnifyingGlass />
          </div>
          <h3 className="mb-2 text-[1.15rem] text-white">No results{search ? ` for "${search}"` : ""}</h3>
          <p>Try a different character or romaji.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map(([gojuonRow, rows]) => (
            <div key={gojuonRow}>
              <div className="mb-2.5 text-[0.8rem] font-extrabold uppercase tracking-[1.2px] text-text-muted">
                {GOJUON_ROW_LABELS[gojuonRow] ?? gojuonRow}
              </div>
              <div className="flex flex-wrap gap-2.5">
                {rows.map((row) => (
                  <div
                    key={row.id}
                    className="flex min-w-[84px] flex-col items-center gap-1 rounded-2xl border border-border-soft bg-bg-cards px-4 py-3.5 backdrop-blur-[10px]"
                  >
                    <div className={`text-3xl ${accentClass}`}>{row.character}</div>
                    <div className="text-[0.85rem] font-semibold text-text-muted">{row.romaji}</div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Mirrors the real grid exactly -- same gojuon-row groups, same card count per row, same card
 * shell -- so only the character/romaji text is a placeholder instead of the whole card. Safe to
 * hardcode: the kana syllabaries are a fixed, closed set (see GOJUON_ROW_LAYOUT). */
export function BrowseKanaListSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {GOJUON_ROW_LAYOUT.map(({ row, count }) => (
        <div key={row}>
          <div className="mb-2.5 text-[0.8rem] font-extrabold uppercase tracking-[1.2px] text-text-muted">
            {GOJUON_ROW_LABELS[row] ?? row}
          </div>
          <div className="flex flex-wrap gap-2.5">
            {Array.from({ length: count }).map((_, i) => (
              <div
                key={i}
                className="flex min-w-[84px] flex-col items-center gap-1 rounded-2xl border border-border-soft bg-bg-cards px-4 py-3.5 backdrop-blur-[10px]"
              >
                <Skeleton className="h-9 w-8 rounded-md" />
                <Skeleton className="h-3.5 w-7 rounded" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
