"use client";

import { useEffect, useRef, useState } from "react";
import { describeKanjiWordsError } from "@/lib/data/adminKanjiWords";
import { Button } from "@/app/components/ui/Button";
import { Modal } from "@/app/components/ui/Modal";
import { Skeleton } from "@/app/components/ui/Skeleton";
import type { KanjiWordsBulkResult } from "@/lib/types";
import { describeBulkResult } from "./wordLabels";

export interface OperationSpec {
  title: string;
  /** What it does, in one or two sentences, shown above the preview. */
  description: string;
  confirmLabel: string;
  danger?: boolean;
  /** Runs the operation; `dryRun` true only counts. The preview and the real run use the same commits server-side. */
  run: (dryRun: boolean, note: string | null) => Promise<KanjiWordsBulkResult>;
}

interface OperationModalProps {
  spec: OperationSpec;
  onClose: () => void;
  /** The real run succeeded. */
  onDone: (result: KanjiWordsBulkResult) => void;
}

/**
 * Preview first, then confirm. On open it runs the operation as a dry run and shows what it would do; only
 * "Confirm" runs it for real (and the result is a batch that History can undo as a whole).
 */
export function OperationModal({ spec, onClose, onDone }: OperationModalProps) {
  const [preview, setPreview] = useState<KanjiWordsBulkResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [note, setNote] = useState("");
  const specRef = useRef(spec);

  useEffect(() => {
    let cancelled = false;
    specRef
      .current.run(true, null)
      .then((result) => {
        if (!cancelled) setPreview(result);
      })
      .catch((err) => {
        if (!cancelled) setError(describeKanjiWordsError(err, "Couldn't work out what this would do."));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function confirm() {
    setRunning(true);
    setError(null);
    try {
      const result = await spec.run(false, note.trim() || null);
      onDone(result);
    } catch (err) {
      setError(describeKanjiWordsError(err, "Failed."));
      setRunning(false);
    }
  }

  const nothingToDo = preview !== null && preview.changed === 0;

  return (
    <Modal onClose={onClose} labelledBy="kanji-words-operation-title">
      <h3 id="kanji-words-operation-title" className="mb-1.5 text-lg font-extrabold">
        {spec.title}
      </h3>
      <p className="mb-4 text-[0.85rem] leading-normal text-text-muted">{spec.description}</p>

      <div className="mb-4 rounded-xl border border-border-soft bg-white/[0.02] p-3 text-sm">
        {preview === null && error === null ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : null}
        {preview ? (
          <ul className="space-y-1">
            {describeBulkResult(preview).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
        {error ? <p className="text-accent-red">{error}</p> : null}
      </div>

      {preview && !nothingToDo ? (
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={300}
          placeholder="Note (optional), kept in the history"
          className="mb-4 w-full rounded-xl border border-border-soft bg-bg-cards px-3.5 py-2 text-sm outline-none placeholder:text-text-muted focus:border-accent-red/50"
        />
      ) : null}

      <div className="flex justify-end gap-3">
        <Button size="sm" variant="secondary" onClick={onClose} disabled={running}>
          Cancel
        </Button>
        <Button
          size="sm"
          danger={spec.danger}
          onClick={() => void confirm()}
          loading={running}
          disabled={preview === null || nothingToDo}
        >
          {spec.confirmLabel}
        </Button>
      </div>
    </Modal>
  );
}
