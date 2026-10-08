"use client";

import { useEffect, useState } from "react";
import { localDateKey, msUntilLocalMidnight } from "./time";

/** Today's date key ("YYYY-MM-DD") in `tz`, and a re-render at the student's next midnight -- not
 * UTC's, not the browser's, not New York's. Null until mounted, because the visitor's clock is only
 * known client-side (rendering it during the static export would mismatch on hydration).
 *
 * A timer that sleeps through the night is not trusted alone: the tab may have been in the
 * background or the machine asleep when midnight passed, so the date is also re-read whenever the
 * tab becomes visible or focused again. */
export function useLocalToday(tz: string): string | null {
  const [today, setToday] = useState<string | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;

    function sync() {
      const now = Date.now();
      setToday(localDateKey(now, tz));
      clearTimeout(timer);
      // A little past midnight, and never longer than a day in case the clock was changed.
      timer = setTimeout(sync, Math.min(msUntilLocalMidnight(now, tz) + 500, 25 * 3_600_000));
    }

    function onVisible() {
      if (document.visibilityState === "visible") sync();
    }

    sync();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", sync);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", sync);
    };
  }, [tz]);

  return today;
}
