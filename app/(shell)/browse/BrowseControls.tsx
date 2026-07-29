"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { JLPT_LEVELS, type JlptLevel } from "@/lib/srs/constants";

interface Props {
  initialSearch: string;
  initialLevels: JlptLevel[];
  basePath: string;
  placeholder: string;
}

const DEBOUNCE_MS = 350;

export function BrowseControls({ initialSearch, initialLevels, basePath, placeholder }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState(initialSearch);
  const [levels, setLevels] = useState<JlptLevel[]>(initialLevels);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function pushUrl(nextSearch: string, nextLevels: JlptLevel[]) {
    const params = new URLSearchParams();
    if (nextSearch) params.set("search", nextSearch);
    // Set explicitly (even empty) so "user cleared every level" is distinguishable
    // server-side from "no level param yet" (which falls back to enabled_levels).
    params.set("level", nextLevels.join(","));
    const qs = params.toString();
    router.replace(qs ? `${basePath}?${qs}` : basePath);
  }

  function handleSearchChange(value: string) {
    setSearch(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => pushUrl(value, levels), DEBOUNCE_MS);
  }

  function toggleLevel(level: JlptLevel) {
    const next = levels.includes(level) ? levels.filter((l) => l !== level) : [...levels, level];
    setLevels(next);
    pushUrl(search, next);
  }

  return (
    <>
      <div className="mb-4.5 flex flex-wrap gap-3">
        <div className="flex min-w-55 flex-1 items-center gap-2.5 rounded-xl border border-border-soft bg-white/[0.03] px-4 py-3">
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 shrink-0 text-text-muted"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            className="flex-1 bg-transparent text-[0.95rem] text-white outline-none placeholder:text-text-muted"
            placeholder={placeholder}
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
      </div>
      <div className="mb-4.5 flex flex-wrap gap-2">
        {JLPT_LEVELS.map((level) => {
          const active = levels.includes(level);
          return (
            <button
              key={level}
              type="button"
              className={`cursor-pointer rounded-xl border px-4 py-[11px] text-[0.85rem] font-extrabold transition-all ${
                active
                  ? "border-accent-blue/35 bg-accent-blue/[0.12] text-accent-blue"
                  : "border-border-soft bg-white/[0.03] text-text-muted hover:border-white/20"
              }`}
              onClick={() => toggleLevel(level)}
            >
              {level}
            </button>
          );
        })}
      </div>
    </>
  );
}
