"use client";

import { useEffect, useState } from "react";

export function NextReviewTime({ dueAt }: { dueAt: string }) {
  // The visitor's locale/timezone can differ from whatever the server process
  // defaults to, so the formatted time is computed only after mount — rendering
  // it during SSR would make the server's markup mismatch the client's and trip
  // a hydration error.
  const [time, setTime] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTime(new Date(dueAt).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }));
  }, [dueAt]);

  return <>{time}</>;
}
