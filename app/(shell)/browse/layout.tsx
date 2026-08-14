"use client";

import { useEffect } from "react";
import { clearStoredSearch } from "@/lib/browse/searchStorage";

export default function BrowseLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    return () => clearStoredSearch();
  }, []);

  return <>{children}</>;
}
