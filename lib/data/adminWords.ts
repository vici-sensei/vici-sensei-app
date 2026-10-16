import type { AppSupabaseClient } from "@/lib/supabase/types";
import type { AdminWordRow } from "@/lib/types";

/**
 * The admin "All words" list (/admin/words) reads `vocabulary` straight through its "Authenticated users
 * can read vocabulary" RLS policy -- no RPC, so it works the same on every project. The table is identical
 * on EU and US (17,349 rows on 2026-10-14), so whichever region the admin is on gives the same list.
 */

const WORD_LIST_COLUMNS =
  "id, word, kana_reading, romaji_reading, furiganas, short_meaning, primary_meanings, other_meanings, jlpt_level, is_common_jisho, usually_kana, study_enabled, frequency_number";

/** Asked for per request; the API may hand back fewer (its max-rows cap, 1000 on Supabase by default). */
const REQUESTED_PAGE_SIZE = 1000;

/** Every word in the dictionary, study-enabled or not, in id order. ~7 MB of JSON, so the pages after the
 *  first are fetched in parallel. */
export async function fetchAllWords(supabase: AppSupabaseClient): Promise<AdminWordRow[]> {
  const first = await supabase
    .from("vocabulary")
    .select(WORD_LIST_COLUMNS, { count: "exact" })
    .order("id")
    .range(0, REQUESTED_PAGE_SIZE - 1);
  if (first.error) throw new Error(first.error.message);

  const rows = first.data as AdminWordRow[];
  const total = first.count ?? rows.length;
  // The first page's real length is the API's cap, so the rest is cut into pages of that size: asking
  // for more than the cap would silently drop the rows past it.
  const pageSize = rows.length;
  if (pageSize === 0 || pageSize >= total) return rows;

  const pages = await Promise.all(
    Array.from({ length: Math.ceil((total - pageSize) / pageSize) }, (_, i) => {
      const from = pageSize * (i + 1);
      return supabase
        .from("vocabulary")
        .select(WORD_LIST_COLUMNS)
        .order("id")
        .range(from, from + pageSize - 1);
    })
  );
  for (const page of pages) {
    if (page.error) throw new Error(page.error.message);
    rows.push(...(page.data as AdminWordRow[]));
  }
  return rows;
}
