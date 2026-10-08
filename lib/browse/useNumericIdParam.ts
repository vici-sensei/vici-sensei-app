"use client";

import { useSearchParams } from "next/navigation";

/** The `?id=` of a dictionary detail page (the static export has no [id] segment, so the detail
 * routes read it from the query), or null when it is missing, empty or not a number -- the page
 * then shows its "not found" state. Must be called under a Suspense boundary (useSearchParams). */
export function useNumericIdParam(): number | null {
  const raw = useSearchParams().get("id");
  if (!raw) return null;
  const id = Number(raw);
  return Number.isNaN(id) ? null : id;
}
