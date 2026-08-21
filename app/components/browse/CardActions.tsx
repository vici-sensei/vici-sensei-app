"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api/client";
import { resetCard, suspendCard, reactivateCard } from "@/lib/client-data/cards";
import type { CardType } from "@/lib/srs/progressTables";
import type { ProgressStatus } from "@/lib/srs/constants";
import { useToast } from "@/app/components/ui/Toast";
import { Button } from "@/app/components/ui/Button";

type CardAction = "suspend" | "reactivate" | "reset";

interface Props {
  type: CardType;
  id: number;
  status: ProgressStatus;
  onOptimisticUpdate: (action: CardAction) => void;
  onSuccess: () => void;
  onError: () => void;
}

export function CardActions({ type, id, status, onOptimisticUpdate, onSuccess, onError }: Props) {
  const { showToast } = useToast();
  const [pending, setPending] = useState<CardAction | null>(null);

  async function handle(action: CardAction) {
    setPending(action);
    onOptimisticUpdate(action);
    try {
      if (action === "suspend") await suspendCard(type, id);
      else if (action === "reactivate") await reactivateCard(type, id);
      else await resetCard(type, id);
      onSuccess();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : `Could not ${action} this card.`, "error");
      onError();
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {status === "suspended" ? (
        <Button variant="secondary" size="sm" onClick={() => handle("reactivate")} disabled={pending !== null}>
          {pending === "reactivate" ? "Reactivating…" : "Reactivate"}
        </Button>
      ) : (
        <Button variant="secondary" size="sm" onClick={() => handle("suspend")} disabled={pending !== null}>
          {pending === "suspend" ? "Suspending…" : "Suspend"}
        </Button>
      )}
      {/* A kanji's reading cards only get (re)created as a batch when the kanji itself is
          introduced (see resetCard/introduce_kanji) -- resetting one reading on its own would
          delete it with no way for it to come back short of resetting the whole kanji. */}
      {type !== "reading" && (
        <Button variant="secondary" size="sm" danger onClick={() => handle("reset")} disabled={pending !== null}>
          {pending === "reset" ? "Resetting…" : "Reset progress"}
        </Button>
      )}
    </div>
  );
}
