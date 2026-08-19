"use client";

import { useEffect } from "react";

/** flag-icons.min.css (~28KB) defines a couple hundred per-country background-image rules that
 *  only matter on the two screens that actually render a flag (CountrySelect, the leaderboard's
 *  country column) -- loaded on demand from those call sites instead of shipping it globally on
 *  every page. Dynamic `import()` of an already-loaded CSS module is a cheap no-op, so calling
 *  this from both places is safe. */
export function useFlagIconsCss() {
  useEffect(() => {
    void import("flag-icons/css/flag-icons.min.css");
  }, []);
}
