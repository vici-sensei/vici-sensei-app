"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  describeKanjiWordsError,
  fetchKanjiWordsHistory,
  restoreKanjiWordsVersion,
} from "@/lib/data/adminKanjiWords";
import { ConfirmDialog } from "@/app/components/ui/ConfirmDialog";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { useToast } from "@/app/components/ui/Toast";
import type { AsyncStatus, KanjiWordsHistory, KanjiWordsHistoryVersion } from "@/lib/types";
import { formatWhen, historyKindLabel } from "./wordLabels";

interface HistoryPanelProps {
  kanjiId: number;
  /** The kanji's current version, quoted by a restore so a change made meanwhile isn't overwritten blindly. */
  currentVersion: number;
  onRestored: () => void;
}

function diffIds(before: number[], after: number[]): { added: number[]; removed: number[] } {
  const b = new Set(before);
  const a = new Set(after);
  return { added: after.filter((id) => !b.has(id)), removed: before.filter((id) => !a.has(id)) };
}

function WordList({ ids, words, sign }: { ids: number[]; words: KanjiWordsHistory["words"]; sign: "+" | "−" }) {
  if (ids.length === 0) return null;
  return (
    <span className={sign === "+" ? "text-accent-green" : "text-accent-red"}>
      {ids.map((id) => `${sign}${words[String(id)]?.[0] ?? `#${id}`}`).join(" ")}
    </span>
  );
}

export function HistoryPanel({ kanjiId, currentVersion, onRestored }: HistoryPanelProps) {
  const { showToast } = useToast();
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [history, setHistory] = useState<KanjiWordsHistory | null>(null);
  const [restoreTo, setRestoreTo] = useState<number | null>(null);
  const [restoring, setRestoring] = useState(false);

  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetchKanjiWordsHistory(createClient(), kanjiId)
      .then((h) => {
        if (cancelled) return;
        setHistory(h);
        setStatus("loaded");
      })
      .catch(() => {
        if (!cancelled) setStatus((prev) => (prev === "loaded" ? prev : "error"));
      });
    return () => {
      cancelled = true;
    };
  }, [kanjiId, reloadTick]);

  // Each row is shown against the one before it; the oldest one against the untouched list (the algorithm's).
  const rows = useMemo(() => {
    const versions = history?.versions ?? [];
    return versions.map((v, i) => {
      const before = versions[i + 1]?.final_ids ?? v.algo_ids;
      return { version: v, ...diffIds(before, v.final_ids) };
    });
  }, [history]);

  async function confirmRestore() {
    if (restoreTo === null) return;
    setRestoring(true);
    try {
      await restoreKanjiWordsVersion(createClient(), {
        kanjiId,
        version: restoreTo,
        expectedVersion: currentVersion,
        note: null,
      });
      showToast(restoreTo === 0 ? "Back to the algorithm's list." : `Restored version ${restoreTo}.`);
      setRestoreTo(null);
      onRestored();
      setReloadTick((tick) => tick + 1);
    } catch (err) {
      showToast(describeKanjiWordsError(err, "Failed to restore."), "error");
      setRestoreTo(null);
    } finally {
      setRestoring(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="space-y-2">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }
  if (status === "error" || !history) return <p className="text-sm text-text-muted">Failed to load the history.</p>;

  return (
    <div>
      <p className="mb-3 text-sm text-text-muted">
        Every change is kept, nothing is ever deleted. Restoring a version creates a new one, so a restore can be undone too.
      </p>
      <ol className="space-y-2">
        {rows.map(({ version: v, added, removed }) => (
          <HistoryRow
            key={v.version}
            version={v}
            added={added}
            removed={removed}
            words={history.words}
            isCurrent={v.version === currentVersion}
            onRestore={() => setRestoreTo(v.version)}
          />
        ))}
        <li className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border-soft bg-white/[0.02] p-3 text-sm">
          <span>
            <span className="font-bold">Version 0</span>
            <span className="text-text-muted"> · untouched: exactly what the algorithm picks</span>
          </span>
          {currentVersion === 0 ? (
            <span className="text-xs font-bold text-text-muted">Current</span>
          ) : (
            <RestoreButton onClick={() => setRestoreTo(0)} />
          )}
        </li>
      </ol>

      {restoreTo !== null ? (
        <ConfirmDialog
          title={restoreTo === 0 ? "Go back to the algorithm's list?" : `Restore version ${restoreTo}?`}
          description="This kanji gets the words of that version as a NEW version. Nothing in the history is removed."
          confirmLabel="Restore"
          loading={restoring}
          onConfirm={confirmRestore}
          onCancel={() => setRestoreTo(null)}
        />
      ) : null}
    </div>
  );
}

function RestoreButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-lg border border-border-soft bg-white/[0.03] px-3 py-1 text-[0.78rem] font-bold text-text-muted transition-colors hover:border-white/20 hover:text-white"
    >
      Restore
    </button>
  );
}

function HistoryRow({
  version: v,
  added,
  removed,
  words,
  isCurrent,
  onRestore,
}: {
  version: KanjiWordsHistoryVersion;
  added: number[];
  removed: number[];
  words: KanjiWordsHistory["words"];
  isCurrent: boolean;
  onRestore: () => void;
}) {
  return (
    <li className="rounded-xl border border-border-soft bg-white/[0.02] p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          <span className="font-bold">Version {v.version}</span>
          <span className="text-text-muted"> · {historyKindLabel(v)}</span>
        </span>
        {isCurrent ? <span className="text-xs font-bold text-text-muted">Current</span> : <RestoreButton onClick={onRestore} />}
      </div>
      <div className="mt-1 text-xs text-text-muted">
        {formatWhen(v.created_at)} · {v.admin_email ?? "system"}
        {v.reviewed ? " · reviewed" : ""}
      </div>
      {added.length > 0 || removed.length > 0 ? (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[0.85rem] font-semibold">
          <WordList ids={added} words={words} sign="+" />
          <WordList ids={removed} words={words} sign="−" />
        </div>
      ) : (
        <div className="mt-1.5 text-xs italic text-text-muted">The word list did not change.</div>
      )}
      {v.note ? <p className="mt-1.5 text-[0.85rem] leading-snug">“{v.note}”</p> : null}
    </li>
  );
}
