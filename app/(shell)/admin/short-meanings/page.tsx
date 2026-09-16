"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useRequireAdmin } from "@/lib/auth/useRequireAdmin";
import { useVocabularyShortMeanings, updateVocabularyShortMeaning } from "@/lib/client-data/vocabularyShortMeanings";
import { Breadcrumbs } from "@/app/components/ui/Breadcrumbs";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { PillSelector } from "@/app/components/ui/PillSelector";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { getErrorMessage } from "@/lib/api/client";
import { JLPT_LEVELS } from "@/lib/srs/constants";
import type { AsyncStatus, VocabularyShortMeaningRow } from "@/lib/types";

const SAVE_DEBOUNCE_MS = 600;
const ALL_LEVELS = "all" as const;
type LevelFilter = (typeof JLPT_LEVELS)[number] | typeof ALL_LEVELS;

function matchesQuery(row: VocabularyShortMeaningRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return row.word.toLowerCase().includes(q) || (row.kana_reading ?? "").toLowerCase().includes(q);
}

export default function AdminShortMeaningsPage() {
  const { user } = useAuth();
  const { ready, checking } = useRequireAdmin();
  const { data: rows, status } = useVocabularyShortMeanings(ready ? user : null);
  const [query, setQuery] = useState("");
  const [levelFilter, setLevelFilter] = useState<LevelFilter>(ALL_LEVELS);

  // Per-row edited value, seeded from the fetched rows once they arrive -- keeps typing snappy
  // without waiting on a refetch, and isn't clobbered since this page never refetches afterward.
  const [edits, setEdits] = useState<Record<number, string>>({});
  const [rowStatus, setRowStatus] = useState<Record<number, AsyncStatus | "idle">>({});
  const [rowError, setRowError] = useState<Record<number, string | null>>({});
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  useEffect(() => {
    if (!rows) return;
    setEdits((prev) => {
      const next = { ...prev };
      for (const row of rows) {
        if (!(row.id in next)) next[row.id] = row.short_meaning ?? "";
      }
      return next;
    });
  }, [rows]);

  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
    };
  }, []);

  async function save(id: number, value: string) {
    setRowStatus((prev) => ({ ...prev, [id]: "loading" }));
    setRowError((prev) => ({ ...prev, [id]: null }));
    try {
      await updateVocabularyShortMeaning(id, value.trim());
      setRowStatus((prev) => ({ ...prev, [id]: "loaded" }));
    } catch (err) {
      setRowStatus((prev) => ({ ...prev, [id]: "error" }));
      setRowError((prev) => ({ ...prev, [id]: getErrorMessage(err, "Couldn't save.") }));
    }
  }

  function handleChange(id: number, value: string) {
    setEdits((prev) => ({ ...prev, [id]: value }));
    const existing = timers.current.get(id);
    if (existing) clearTimeout(existing);
    timers.current.set(
      id,
      setTimeout(() => {
        timers.current.delete(id);
        void save(id, value);
      }, SAVE_DEBOUNCE_MS),
    );
  }

  function handleBlur(id: number, value: string) {
    const existing = timers.current.get(id);
    if (!existing) return;
    clearTimeout(existing);
    timers.current.delete(id);
    void save(id, value);
  }

  const levelCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const row of rows ?? []) {
      if (row.jlpt_level) counts[row.jlpt_level] = (counts[row.jlpt_level] ?? 0) + 1;
    }
    return counts;
  }, [rows]);

  const levelOptions = useMemo(
    () => [
      { value: ALL_LEVELS, label: `All (${rows?.length ?? 0})` },
      ...JLPT_LEVELS.map((level) => ({ value: level, label: `${level} (${levelCounts[level] ?? 0})` })),
    ],
    [rows, levelCounts],
  );

  const filtered = useMemo(
    () =>
      (rows ?? []).filter(
        (r) => matchesQuery(r, query) && (levelFilter === ALL_LEVELS || r.jlpt_level === levelFilter),
      ),
    [rows, query, levelFilter],
  );

  if (checking || !ready) return <FullScreenLoader />;

  return (
    <div>
      <Breadcrumbs items={[{ label: "Teacher", href: "/admin" }, { label: "Short meanings" }]} />
      <h1 className="mb-2 text-[2.1rem] font-extrabold leading-[1.2] tracking-[-0.8px] text-center md:text-left">
        Short meanings
      </h1>
      <p className="mb-5 text-base leading-[1.6] text-text-muted text-center md:text-left">
        Vocabulary words whose primary meanings are all too long to show compactly -- edit the curated short gloss below.
        Saves automatically as you type.
      </p>

      <PillSelector
        options={levelOptions}
        active={levelFilter}
        onChange={setLevelFilter}
        variant="tabs"
        className="mb-4"
      />

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search by word or reading..."
        className="mb-5 w-full max-w-sm rounded-xl border border-border-soft bg-bg-cards px-4 py-2.5 text-sm outline-none placeholder:text-text-muted focus:border-accent-red/50"
      />

      <GlassCard padding="sm" className="overflow-x-auto">
        <table className="w-full min-w-175 break-words text-left text-sm">
          <thead>
            <tr className="border-b border-border-soft text-text-muted">
              <th className="px-3 py-2.5 font-semibold">Word</th>
              <th className="px-3 py-2.5 font-semibold">Reading</th>
              <th className="px-3 py-2.5 font-semibold">Primary meanings</th>
              <th className="px-3 py-2.5 font-semibold">Short meaning</th>
            </tr>
          </thead>
          <tbody>
            {status === "loading" &&
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-border-soft/50">
                  <td className="px-3 py-3" colSpan={4}>
                    <Skeleton className="h-5 w-full" />
                  </td>
                </tr>
              ))}
            {status === "error" && (
              <tr>
                <td className="px-3 py-6 text-center text-text-muted" colSpan={4}>
                  Failed to load vocabulary rows.
                </td>
              </tr>
            )}
            {status === "loaded" && filtered.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-text-muted" colSpan={4}>
                  {rows?.length === 0 ? "No rows have a short meaning yet." : "No results."}
                </td>
              </tr>
            )}
            {status === "loaded" &&
              filtered.map((row) => {
                const value = edits[row.id] ?? row.short_meaning ?? "";
                const rs = rowStatus[row.id] ?? "idle";
                return (
                  <tr key={row.id} className="border-b border-border-soft/50 last:border-0">
                    <td className="px-3 py-3 font-semibold">{row.word}</td>
                    <td className="px-3 py-3 text-text-muted">{row.kana_reading}</td>
                    <td className="max-w-[280px] px-3 py-3 text-text-muted">{(row.primary_meanings ?? []).join("; ")}</td>
                    <td className="px-3 py-3">
                      <input
                        type="text"
                        value={value}
                        onChange={(e) => handleChange(row.id, e.target.value)}
                        onBlur={(e) => handleBlur(row.id, e.target.value)}
                        className="w-full min-w-[160px] rounded-lg border border-border-soft bg-white/[0.03] px-3 py-2 text-sm outline-none focus:border-accent-red/50"
                      />
                      <div className="mt-1 min-h-4 text-xs">
                        {rs === "loading" && <span className="text-text-muted">Saving...</span>}
                        {rs === "error" && <span className="text-accent-red">{rowError[row.id] ?? "Couldn't save."}</span>}
                        {rs === "loaded" && <span className="font-medium text-accent-green">Saved</span>}
                      </div>
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </GlassCard>
    </div>
  );
}
