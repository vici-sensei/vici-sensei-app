"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchKanjiWordsBatches } from "@/lib/data/adminKanjiWords";
import { Modal } from "@/app/components/ui/Modal";
import { Skeleton } from "@/app/components/ui/Skeleton";
import type { AsyncStatus, KanjiWordsBatch } from "@/lib/types";
import { formatWhen, historyKindLabel } from "./wordLabels";

interface BatchesModalProps {
  onClose: () => void;
  /** Opens the undo preview for a batch (this modal closes first). */
  onUndo: (batch: KanjiWordsBatch) => void;
  /** Opens the "restore everything to this moment" preview; `at` is an ISO timestamp. */
  onRestoreTo: (at: string) => void;
}

/** Recent bulk changes (undoable as a whole) and the global "go back to a moment" restore. */
export function BatchesModal({ onClose, onUndo, onRestoreTo }: BatchesModalProps) {
  const [status, setStatus] = useState<AsyncStatus>("loading");
  const [batches, setBatches] = useState<KanjiWordsBatch[]>([]);
  const [moment, setMoment] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetchKanjiWordsBatches(createClient(), 30)
      .then((rows) => {
        if (cancelled) return;
        setBatches(rows);
        setStatus("loaded");
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const momentDate = moment ? new Date(moment) : null;
  const momentValid = momentDate !== null && !Number.isNaN(momentDate.getTime());

  return (
    <Modal onClose={onClose} labelledBy="kanji-words-batches-title" showCloseButton>
      <h3 id="kanji-words-batches-title" className="mb-1 pr-10 text-lg font-extrabold">
        Bulk changes &amp; restore
      </h3>
      <p className="mb-4 text-[0.85rem] leading-normal text-text-muted">
        Undo a whole bulk change in one step, or put every kanji back as it was at a moment. Both only touch kanji nobody
        edited since, and both are recorded, so they can be undone too.
      </p>

      <div className="max-h-[50vh] space-y-2 overflow-y-auto pr-1">
        {status === "loading" ? (
          <>
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </>
        ) : null}
        {status === "error" ? <p className="text-sm text-text-muted">Failed to load the bulk changes.</p> : null}
        {status === "loaded" && batches.length === 0 ? (
          <p className="text-sm italic text-text-muted">No bulk changes yet.</p>
        ) : null}
        {batches.map((batch) => (
          <div key={batch.batch_id} className="rounded-xl border border-border-soft bg-white/[0.02] p-3 text-sm">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-bold">{historyKindLabel(batch)}</div>
                <div className="text-xs text-text-muted">
                  {formatWhen(batch.created_at)} · {batch.admin_email ?? "system"}
                </div>
                <div className="text-xs text-text-muted">
                  {batch.kanji} kanji · {batch.undoable} still as this batch left {batch.undoable === 1 ? "it" : "them"}
                </div>
                {batch.note ? <p className="mt-1 text-[0.82rem]">“{batch.note}”</p> : null}
              </div>
              <button
                type="button"
                disabled={batch.undoable === 0}
                onClick={() => onUndo(batch)}
                className="shrink-0 cursor-pointer rounded-lg border border-border-soft bg-white/[0.03] px-3 py-1 text-[0.78rem] font-bold text-text-muted transition-colors hover:border-white/20 hover:text-white disabled:cursor-not-allowed disabled:opacity-45"
              >
                Undo…
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 border-t border-border-soft pt-4">
        <h4 className="mb-2 text-[0.7rem] font-extrabold uppercase tracking-[1px] text-text-muted">
          Restore every kanji to a moment
        </h4>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="datetime-local"
            value={moment}
            onChange={(e) => setMoment(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-border-soft bg-bg-cards px-3 py-2 text-sm outline-none focus:border-accent-red/50"
          />
          <button
            type="button"
            disabled={!momentValid}
            onClick={() => momentDate && onRestoreTo(momentDate.toISOString())}
            className="cursor-pointer rounded-lg border border-accent-red/30 bg-accent-red/10 px-3 py-2 text-[0.82rem] font-bold text-accent-red hover:bg-accent-red/15 disabled:cursor-not-allowed disabled:opacity-45"
          >
            Preview…
          </button>
        </div>
      </div>
    </Modal>
  );
}
