import { cookies } from "next/headers";

/** IANA timezone name set client-side by TimezoneSync, e.g. "Europe/Bucharest". Falls back to UTC-based day boundaries when absent (first-ever request in a browsing session). */
export async function getRequestTimezone(): Promise<string | undefined> {
  const store = await cookies();
  return store.get("tz")?.value || undefined;
}
