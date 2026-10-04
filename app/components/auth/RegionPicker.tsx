"use client";

import { setActiveRegion, type Region } from "@/lib/supabase/regions";
import { REGION_LABEL } from "@/lib/auth/passwordAuth";

/** Shown only behind NEXT_PUBLIC_MULTI_REGION -- picks which Supabase project createClient()
 * talks to (lib/supabase/regions.ts), before the user ever signs in or up. Picking a different
 * region than the page loaded with forces a reload: AuthProvider (mounted once at the root layout)
 * already built its own client for the region active at mount time and subscribed to *that* GoTrue
 * instance's auth events -- changing the active region afterward without reloading would leave it
 * listening to the wrong project indefinitely. A manual region change is rare enough that a reload
 * is a fine trade for not having to keep two client instances in sync. */
export function RegionPicker({ region }: { region: Region }) {
  return (
    <div className="mx-auto mb-[clamp(1.5rem,3dvh,2.5rem)] flex w-fit gap-1 rounded-full border border-border-soft bg-white/[0.03] p-1">
      {(["eu", "us"] as const).map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => {
            if (option === region) return;
            setActiveRegion(option);
            window.location.reload();
          }}
          className={`rounded-full px-8 py-4 text-xs font-bold uppercase tracking-[0.5px] transition-colors ${
            option === region ? "bg-accent-red text-white" : "text-text-muted hover:text-white"
          }`}
        >
          {REGION_LABEL[option]}
        </button>
      ))}
    </div>
  );
}
