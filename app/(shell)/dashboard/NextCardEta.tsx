import { NextCardCountdown } from "./NextCardCountdown";
import { ClockSkewNotice } from "@/app/components/ui/ClockSkewNotice";

/** Countdown to the next due card, plus the "clock looks off" footnote when relevant -- always
 * shown together (see ClockSkewNotice), bundled here so callers can't add one without the other
 * and don't have to thread `clockOffsetMs` to both separately. */
export function NextCardEta({
  dueAt,
  clockOffsetMs,
  onElapsed,
}: {
  dueAt: string;
  clockOffsetMs: number;
  onElapsed?: () => void;
}) {
  return (
    <>
      <NextCardCountdown dueAt={dueAt} clockOffsetMs={clockOffsetMs} onElapsed={onElapsed} />
      <ClockSkewNotice clockOffsetMs={clockOffsetMs} />
    </>
  );
}
