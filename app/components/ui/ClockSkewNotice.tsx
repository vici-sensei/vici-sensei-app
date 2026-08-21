const NOTABLE_SKEW_MS = 60_000;

/** Small "synced to server time" footnote, shown only once the device clock is off by more than
 * a minute -- shared by every countdown that corrects for clock skew via useServerClockOffset
 * (LeaderboardCountdown, NextCardCountdown), so the threshold and copy can't drift between them. */
export function ClockSkewNotice({ clockOffsetMs, className = "" }: { clockOffsetMs: number; className?: string }) {
  if (Math.abs(clockOffsetMs) <= NOTABLE_SKEW_MS) return null;
  return (
    <span className={`block text-xs text-text-muted/70 ${className}`}>
      Your clock seems off, so we're using server time. Try syncing your device's clock.
    </span>
  );
}
