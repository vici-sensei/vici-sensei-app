"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useRequireAdmin } from "@/lib/auth/useRequireAdmin";
import { useJmdictSenseReviewRows, saveJmdictEntrySenses } from "@/lib/client-data/jmdictSenses";
import { Breadcrumbs } from "@/app/components/ui/Breadcrumbs";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { getErrorMessage } from "@/lib/api/client";
import type { AsyncStatus, JmdictSense, JmdictSenseReviewRow } from "@/lib/types";

// jmdict_entries.id values flagged during the primary/secondary sense review of the
// vocabulary-linked subset (2026-09) -- see project notes for how each was picked. The 9 that
// already got an explicit override in 20261124's backfill are included too, so an admin can
// revisit them here instead of only via a one-off SQL script.
const REVIEW_IDS = [
  // already overridden away from JMdict's sense #1 -- worth double-checking the pick
  23758, 69725, 26823, 3784, 10946, 12317, 16427, 54930, 2863,
  // reviewed but left at JMdict's default -- still a close/uncertain call
  26292, 40211, 18804, 22076, 737, 778, 826, 6742, 11422, 30328, 35913, 38711,
];

function senseGlossText(sense: JmdictSense): string {
  return sense.gloss.map((g) => g.text).join(", ");
}

/** A sense with no is_primary key is "not primary"; if NONE are marked, sense #1 is the
 * effective primary -- mirrors the fallback in sync_jmdict_entries_primary_other_meanings(). */
function effectivePrimarySet(senses: JmdictSense[]): Set<number> {
  const explicit = senses.reduce<number[]>((acc, s, i) => (s.is_primary ? [...acc, i] : acc), []);
  return new Set(explicit.length > 0 ? explicit : [0]);
}

interface SenseReviewCardProps {
  row: JmdictSenseReviewRow;
  rowStatus: AsyncStatus | "idle";
  rowError: string | null;
  onToggle: (selected: Set<number>) => void;
}

function SenseReviewCard({ row, rowStatus, rowError, onToggle }: SenseReviewCardProps) {
  const [selected, setSelected] = useState<Set<number>>(() => effectivePrimarySet(row.senses));
  const busy = rowStatus === "loading";

  // Saves immediately on every toggle -- no separate Save button. `next` is computed here (not
  // via the setSelected functional-updater form) so it can also be handed straight to onToggle.
  function toggle(index: number) {
    const next = new Set(selected);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setSelected(next);
    onToggle(next);
  }

  return (
    <GlassCard padding="sm" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="text-xl font-bold">{row.word ?? row.kana_reading}</span>
        {row.word && <span className="text-sm text-text-muted">{row.kana_reading}</span>}
        <span className="ml-auto font-mono text-[11px] text-text-muted">#{row.id}</span>
      </div>

      <div className="flex flex-col gap-2">
        {row.senses.map((sense, i) => {
          const checked = selected.has(i);
          const tags = [
            ...sense.partOfSpeech.map((p) => ({ text: p, tone: "pos" as const })),
            ...sense.field.map((f) => ({ text: f, tone: "field" as const })),
            ...sense.dialect.map((d) => ({ text: d, tone: "dialect" as const })),
            ...sense.misc.map((m) => ({ text: m, tone: "misc" as const })),
          ];
          return (
            <div
              key={i}
              className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${
                checked ? "border-accent-red/60 bg-accent-red/10" : "border-border-soft bg-bg-cards/60"
              }`}
            >
              <input
                type="checkbox"
                className="mt-0.5 h-8 w-8 flex-shrink-0 cursor-pointer accent-accent-red"
                checked={checked}
                disabled={busy}
                onChange={() => toggle(i)}
              />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{senseGlossText(sense)}</div>
                {tags.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1">
                    {tags.map((tag, j) => (
                      <span
                        key={`${tag.tone}-${j}`}
                        className={`rounded-full px-2 py-0.5 text-[11px] ${
                          tag.tone === "pos"
                            ? "border border-border-soft text-text-muted"
                            : tag.tone === "field"
                              ? "bg-accent-blue/15 text-accent-blue"
                              : tag.tone === "dialect"
                                ? "bg-accent-gold/15 text-accent-gold"
                                : "bg-white/[0.06] text-text-muted"
                        }`}
                      >
                        {tag.text}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selected.size === 0 && (
        <p className="text-xs italic text-text-muted">Niciun sens marcat -- implicit se va folosi sensul #1.</p>
      )}

      <div className="min-h-4 text-xs">
        {busy && <span className="text-text-muted">Se salvează...</span>}
        {!busy && rowStatus === "error" && <span className="text-accent-red">{rowError ?? "A apărut o eroare."}</span>}
        {!busy && rowStatus === "loaded" && <span className="font-medium text-accent-green">✓ Salvat</span>}
      </div>
    </GlassCard>
  );
}

export default function AdminJmdictSensesPage() {
  const { user } = useAuth();
  const { ready, checking } = useRequireAdmin();
  const { data: rows, setData, status } = useJmdictSenseReviewRows(ready ? user : null, REVIEW_IDS);
  const [rowStatus, setRowStatus] = useState<Record<number, AsyncStatus | "idle">>({});
  const [rowError, setRowError] = useState<Record<number, string | null>>({});

  async function handleToggle(id: number, senses: JmdictSense[], selected: Set<number>) {
    setRowStatus((prev) => ({ ...prev, [id]: "loading" }));
    setRowError((prev) => ({ ...prev, [id]: null }));
    const updatedSenses = senses.map((sense, i) => ({ ...sense, is_primary: selected.has(i) }));
    try {
      await saveJmdictEntrySenses(id, updatedSenses);
      setData((prev) => (prev ? prev.map((row) => (row.id === id ? { ...row, senses: updatedSenses } : row)) : prev));
      setRowStatus((prev) => ({ ...prev, [id]: "loaded" }));
    } catch (err) {
      setRowStatus((prev) => ({ ...prev, [id]: "error" }));
      setRowError((prev) => ({ ...prev, [id]: getErrorMessage(err, "Nu am putut salva alegerea.") }));
    }
  }

  if (checking || !ready) return <FullScreenLoader />;

  return (
    <div>
      <Breadcrumbs items={[{ label: "Teacher", href: "/admin" }, { label: "Sensuri JMdict" }]} />
      <h1 className="mb-2 text-[2.1rem] font-extrabold leading-[1.2] tracking-[-0.8px] text-center md:text-left">Sensuri JMdict</h1>
      <p className="mb-5 text-base leading-[1.6] text-text-muted text-center md:text-left">
        Bifează sensul (sau sensurile) principale pentru fiecare cuvânt -- restul devin automat secundare, fără să se piardă niciunul.
      </p>

      {status === "loading" && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <GlassCard key={i} padding="sm">
              <Skeleton className="h-24 w-full" />
            </GlassCard>
          ))}
        </div>
      )}
      {status === "error" && <p className="text-center text-text-muted">Nu am putut încărca intrările.</p>}
      {status === "loaded" && rows && rows.length === 0 && <p className="text-center text-text-muted">Nimic de revizuit.</p>}
      {status === "loaded" && rows && rows.length > 0 && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {rows.map((row) => (
            <SenseReviewCard
              key={row.id}
              row={row}
              rowStatus={rowStatus[row.id] ?? "idle"}
              rowError={rowError[row.id] ?? null}
              onToggle={(selected) => handleToggle(row.id, row.senses, selected)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
