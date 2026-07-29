"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api/client";
import type { CardType } from "@/lib/srs/progressTables";
import type { ProgressStatus } from "@/lib/srs/constants";
import { Button } from "@/app/components/ui/Button";

interface Props {
  type: CardType;
  id: number;
  status: ProgressStatus;
}

export function CardActions({ type, id, status }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState<"suspend" | "reset" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handle(action: "suspend" | "reset") {
    setPending(action);
    setError(null);
    try {
      await apiPost(`/api/cards/${type}/${id}/${action}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : `Could not ${action} this card.`);
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="flex items-center gap-2.5">
      {status !== "suspended" && (
        <Button variant="secondary" size="sm" onClick={() => handle("suspend")} disabled={pending !== null}>
          {pending === "suspend" ? "Suspending…" : "Suspend"}
        </Button>
      )}
      <Button variant="secondary" size="sm" danger onClick={() => handle("reset")} disabled={pending !== null}>
        {pending === "reset" ? "Resetting…" : "Reset progress"}
      </Button>
      {error && <span className="text-[0.8rem] tabular-nums text-accent-red">{error}</span>}
    </div>
  );
}
