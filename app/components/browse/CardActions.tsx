"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api/client";
import { resetCard, suspendCard } from "@/lib/client-data/cards";
import type { CardType } from "@/lib/srs/progressTables";
import type { ProgressStatus } from "@/lib/srs/constants";
import { useToast } from "@/app/components/ui/Toast";
import { Button } from "@/app/components/ui/Button";

interface Props {
  type: CardType;
  id: number;
  status: ProgressStatus;
  onSuccess: () => void;
}

export function CardActions({ type, id, status, onSuccess }: Props) {
  const { showToast } = useToast();
  const [pending, setPending] = useState<"suspend" | "reset" | null>(null);

  async function handle(action: "suspend" | "reset") {
    setPending(action);
    try {
      if (action === "suspend") await suspendCard(type, id);
      else await resetCard(type, id);
      onSuccess();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : `Could not ${action} this card.`, "error");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2.5">
      {status !== "suspended" && (
        <Button variant="secondary" size="sm" onClick={() => handle("suspend")} disabled={pending !== null}>
          {pending === "suspend" ? "Suspending…" : "Suspend"}
        </Button>
      )}
      <Button variant="secondary" size="sm" danger onClick={() => handle("reset")} disabled={pending !== null}>
        {pending === "reset" ? "Resetting…" : "Reset progress"}
      </Button>
    </div>
  );
}
