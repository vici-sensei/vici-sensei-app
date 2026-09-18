"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fetchAllHiragana, fetchAllKatakana, fetchKanaExtendedRomaji, fetchKanaRuleLabels } from "@/lib/data/kana";
import { readCache, writeCache } from "@/lib/client-data/localCache";
import { createPrefetcher } from "@/lib/client-data/createPrefetcher";
import { getErrorMessage } from "@/lib/api/client";
import type { AsyncStatus, BrowseKanaEntry, KanaExtendedRomaji, KanaRuleLabel } from "@/lib/types";

// v2: bumped when BrowseKanaEntry gained kana_type/entry_kind/etc (20260903_kana_orthography_rules.sql)
// -- old cached rows lack those fields, and partitioning logic in BrowseKanaListPage would
// silently drop them (undefined !== "character") until the background refetch overwrites them.
const HIRAGANA_CACHE_KEY = "cache:hiragana-list:v2";
const KATAKANA_CACHE_KEY = "cache:katakana-list:v2";
const KANA_RULE_LABELS_CACHE_KEY = "cache:kana-rule-labels:v1";

/** Loads the whole set once (reference data, same for every user) -- Browse then filters this
 * in-memory list locally instead of a server round trip per keystroke. */
function useKanaList<T>(
  fetchAll: () => Promise<T[]>,
  cacheKey: string
): { data: T[] | null; status: AsyncStatus; error: string | null } {
  const [data, setData] = useState<T[] | null>(() => readCache<T[]>(cacheKey));
  const [status, setStatus] = useState<AsyncStatus>(data ? "loaded" : "loading");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchAll()
      .then((rows) => {
        if (cancelled) return;
        setData(rows);
        setStatus("loaded");
        writeCache(cacheKey, rows);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(getErrorMessage(err, "Failed to load."));
        setStatus((prev) => (prev === "loaded" ? prev : "error"));
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fetchAll/cacheKey are stable per call site
  }, []);

  return { data, status, error };
}

export function useHiraganaList() {
  return useKanaList<BrowseKanaEntry>(() => fetchAllHiragana(createClient()), HIRAGANA_CACHE_KEY);
}

export function useKatakanaList() {
  return useKanaList<BrowseKanaEntry>(() => fetchAllKatakana(createClient()), KATAKANA_CACHE_KEY);
}

/** Beginner-friendly section headings (e.g. "Ten-Ten (Dakuten)"), shared by both Browse pages --
 * see KanaRuleLabel. */
export function useKanaRuleLabels() {
  return useKanaList<KanaRuleLabel>(() => fetchKanaRuleLabels(createClient()), KANA_RULE_LABELS_CACHE_KEY);
}

// v2: KanaExtendedRomaji gained `units` -- a v1 entry lacks it, and matchesExtendedRomaji would
// silently match nothing until the background fetch replaced it.
const KANA_EXTENDED_ROMAJI_CACHE_KEY = "cache:kana-extended-romaji:v2";

// Fetched at most once per page load and shared by every kana card that mounts while "Extended
// romaji" is on -- each card remounts (its key changes per card), so a per-hook fetch would fire
// on every single card. localStorage only supplies the value for the very first render; the
// fetch below still runs once per page load and replaces it, so an edit to extended_romaji
// server-side shows up on the next reload.
let kanaExtendedRomajiFresh: KanaExtendedRomaji | null = null;
let kanaExtendedRomajiInFlight: Promise<KanaExtendedRomaji> | null = null;

function loadKanaExtendedRomaji(): Promise<KanaExtendedRomaji> {
  if (kanaExtendedRomajiFresh) return Promise.resolve(kanaExtendedRomajiFresh);
  kanaExtendedRomajiInFlight ??= fetchKanaExtendedRomaji(createClient())
    .then((rows) => {
      kanaExtendedRomajiFresh = rows;
      writeCache(KANA_EXTENDED_ROMAJI_CACHE_KEY, rows);
      return rows;
    })
    .finally(() => {
      kanaExtendedRomajiInFlight = null;
    });
  return kanaExtendedRomajiInFlight;
}

/** The extra accepted spellings for kana reading cards, only loaded while `enabled` (the
 * student's extended_romaji_enabled). `ready` is false only while enabled AND nothing is
 * available yet -- callers hold off checking an answer until then, so a fast first submit can't
 * be judged against romaji alone. If the fetch fails, `ready` still turns true with `data` left
 * null (romaji-only), so a network hiccup never blocks studying. */
export function useKanaExtendedRomaji(enabled: boolean): { data: KanaExtendedRomaji | null; ready: boolean } {
  const [data, setData] = useState<KanaExtendedRomaji | null>(() =>
    enabled ? (kanaExtendedRomajiFresh ?? readCache<KanaExtendedRomaji>(KANA_EXTENDED_ROMAJI_CACHE_KEY)) : null,
  );
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadKanaExtendedRomaji()
      .then((rows) => {
        if (!cancelled) setData(rows);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return { data: enabled ? data : null, ready: !enabled || data !== null || failed };
}

/** Fire-and-forget: called on hover/focus/touchstart of an Explore nav entry point, well before
 * the user actually navigates to the list page -- mirrors prefetchKanjiList/prefetchVocabularyList
 * so Hiragana/Katakana paint from a warm cache too instead of always starting cold on mount. */
export const prefetchHiraganaList = createPrefetcher(async () => {
  const rows = await fetchAllHiragana(createClient());
  writeCache(HIRAGANA_CACHE_KEY, rows);
});

export const prefetchKatakanaList = createPrefetcher(async () => {
  const rows = await fetchAllKatakana(createClient());
  writeCache(KATAKANA_CACHE_KEY, rows);
});

export const prefetchKanaRuleLabels = createPrefetcher(async () => {
  const rows = await fetchKanaRuleLabels(createClient());
  writeCache(KANA_RULE_LABELS_CACHE_KEY, rows);
});
