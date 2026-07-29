"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPost, ApiError } from "@/lib/api/client";
import type { CardType } from "@/lib/srs/progressTables";
import type { ProgressStatus } from "@/lib/srs/constants";

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
    <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
      {status !== "suspended" && (
        <button
          type="button"
          className="btn-secondary btn-sm"
          onClick={() => handle("suspend")}
          disabled={pending !== null}
        >
          {pending === "suspend" ? "Suspending…" : "Suspend"}
        </button>
      )}
      <button
        type="button"
        className="btn-secondary btn-sm btn-danger"
        onClick={() => handle("reset")}
        disabled={pending !== null}
      >
        {pending === "reset" ? "Resetting…" : "Reset progress"}
      </button>
      {error && (
        <span className="pr-meta" style={{ color: "var(--color-accent-red)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
