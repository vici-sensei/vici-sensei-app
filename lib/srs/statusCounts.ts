import { PROGRESS_STATUSES } from "./constants";
import type { ProgressStatusCounts } from "@/lib/types";

/** Every card in `counts`, whatever its status. */
export function sumStatusCounts(counts: ProgressStatusCounts): number {
  return PROGRESS_STATUSES.reduce((sum, status) => sum + counts[status], 0);
}
