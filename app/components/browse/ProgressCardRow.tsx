import type { ReactNode } from "react";
import { StatusPill } from "@/app/components/ui/StatusPill";
import { CardActions } from "@/app/components/browse/CardActions";
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

export function EmptyProgressNotice({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-border-soft bg-white/[0.02] px-5 py-4.5 text-[0.92rem] text-text-muted">
      {children}
    </div>
  );
}
