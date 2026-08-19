"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { AsyncStatus, Country } from "@/lib/types";

// countries is static reference data (see 20260814_add_user_country.sql) --
// fetch it once per page load and share the result across every CountrySelect
// instance instead of re-querying on each mount.
let cache: Country[] | null = null;
let inflight: Promise<Country[]> | null = null;

function loadCountries(): Promise<Country[]> {
  if (cache) return Promise.resolve(cache);
  if (!inflight) {
    inflight = (async () => {
      const supabase = createClient();
      const { data, error } = await supabase.from("countries").select("code, name").order("name");
      if (error) {
        inflight = null;
        throw new Error(error.message);
      }
      cache = data ?? [];
      return cache;
    })();
  }
  return inflight;
}

export function useCountries() {
  const [status, setStatus] = useState<AsyncStatus>(cache ? "loaded" : "loading");
  const [data, setData] = useState<Country[] | null>(cache);

  useEffect(() => {
    if (cache) return;
    let cancelled = false;
    loadCountries()
      .then((countries) => {
        if (!cancelled) {
          setData(countries);
          setStatus("loaded");
        }
      })
      .catch(() => {
        if (!cancelled) setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return { data, status };
}
