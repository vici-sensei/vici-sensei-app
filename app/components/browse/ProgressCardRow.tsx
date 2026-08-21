import type { ReactNode } from "react";
import { StatusPill } from "@/app/components/ui/StatusPill";
import { CardActions } from "@/app/components/browse/CardActions";
import { Button } from "@/app/components/ui/Button";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { formatDueAt } from "@/lib/format";
import type { CardType } from "@/lib/srs/progressTables";
import type { ProgressStatus } from "@/lib/srs/constants";

interface ProgressCardRowProps {
  title: ReactNode;
  status: ProgressStatus;
  dueAt: string;
  cardType: CardType;
  cardId: number;
  onOptimisticUpdate: (action: "suspend" | "reset") => void;
  onSuccess: () => void;
  onError: () => void;
}

export function ProgressCardRow({
  title,
  status,
  dueAt,
  cardType,
  cardId,
  onOptimisticUpdate,
  onSuccess,
  onError,
}: ProgressCardRowProps) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border-soft bg-white/[0.02] px-4.5 py-3.5">
      <div className="text-[0.92rem] font-bold">{title}</div>
      <div className="flex flex-wrap items-center gap-3.5">
        <div className="flex flex-wrap items-center gap-3.5">
          <StatusPill status={status} />
          <span className="text-[0.8rem] tabular-nums text-text-muted">due {formatDueAt(dueAt)}</span>
        </div>
        <CardActions
          type={cardType}
          id={cardId}
          status={status}
          onOptimisticUpdate={onOptimisticUpdate}
          onSuccess={onSuccess}
          onError={onError}
        />
      </div>
    </div>
  );
}

// Fictional progress row shown while progress/detail data is still loading. Pill/due/Suspend
// dimensions are measured off the real ProgressCardRow so the row wraps to the same 2-line
// height once real data lands; "right" is forced onto its own line (basis-full) since every real
// row with a Suspend button already wraps at this width -- only suspended cards (no Suspend
// button) fit on one line, and this placeholder always represents the non-suspended case.
export function PlaceholderProgressCardRow({ title }: { title: ReactNode }) {
  return (
    <div className="mb-2 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border-soft bg-white/[0.02] px-4.5 py-3.5">
      <div className="flex flex-1 items-center gap-2 text-[0.92rem] font-bold">{title}</div>
      <div className="flex basis-full flex-wrap items-center gap-3.5">
        <div className="flex flex-wrap items-center gap-3.5">
          <Skeleton className="h-[26px] w-[88px] rounded-lg" />
          <Skeleton className="h-[19px] w-13" />
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Skeleton className="h-[39px] w-[98px] rounded-xl" />
          <Button variant="secondary" size="sm" danger disabled>
            Reset progress
          </Button>
        </div>
      </div>
    </div>
  );
}

export function EmptyProgressNotice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border-soft bg-white/[0.02] px-5 py-4.5 text-[0.92rem] text-text-muted">
      {children}
    </div>
  );
}
