"use client";

import { useEffect } from "react";
import { clearStoredSearch } from "@/lib/browse/searchStorage";
import { clearStoredLevels } from "@/lib/browse/levelsStorage";

export default function BrowseLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    return () => {
      clearStoredSearch();
      clearStoredLevels();
    };
  }, []);

  return <>{children}</>;
}
