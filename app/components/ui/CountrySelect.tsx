"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useCountries } from "@/lib/client-data/countries";

// Native <option> elements can only render plain text -- no way to put a flag
// icon inside one -- so this is a custom listbox instead of a real <select>.
// A search box is included since the countries list has ~200 entries.

// Plain useEffect runs after paint, so the panel would render once at its
// default height/values and then visibly snap to the real, measured ones a
// frame later. useLayoutEffect runs before the browser paints, so that snap
// is never seen -- but it warns if it runs during SSR, so it's only used
// once we know we're in the browser.
const useIsomorphicLayoutEffect = typeof window !== "undefined" ? useLayoutEffect : useEffect;

// Sticky shell header (app/components/shell/Header.tsx's h-17, sticky top-0)
// -- when opening upward, the panel must stop above this, not tuck under it.
const HEADER_HEIGHT = 68;

// Matches --breakpoint-md (app/globals.css) -- the width below which the
// shared shell nav bar (navBarClasses.ts) switches from a static sidebar to
// a fixed bottom bar.
const MOBILE_NAV_BREAKPOINT = 768;

const TRIGGER_CLASS =
  "flex w-full items-center gap-2.5 rounded-lg border border-border-soft bg-white/[0.03] px-3.5 py-3 text-left text-[0.95rem] text-white outline-none transition-colors focus:border-white/30 disabled:cursor-not-allowed disabled:text-text-muted";

function FlagIcon({ code }: { code: string }) {
  return <span className={`fi fi-${code.toLowerCase()} shrink-0 rounded-[2px] ring-1 ring-white/10`} />;
}

export function CountrySelect({
  id,
  value,
  onChange,
  disabled,
  placement = "up",
}: {
  id?: string;
  value: string | null;
  onChange: (code: string) => void;
  disabled?: boolean;
  /** "up" always opens above the trigger (default). "auto" opens whichever side has more room. */
  placement?: "up" | "auto";
}) {
  const { data: countries, status } = useCountries();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [openDirection, setOpenDirection] = useState<"up" | "down">("up");
  const [panelMaxHeight, setPanelMaxHeight] = useState(288);
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = countries?.find((c) => c.code === value) ?? null;

  const filtered = useMemo(() => {
    if (!countries) return [];
    const q = query.trim().toLowerCase();
    if (!q) return countries;
    return countries.filter((c) => c.name.toLowerCase().includes(q));
  }, [countries, query]);

  function closeDropdown() {
    setOpen(false);
    setQuery("");
  }

  useEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) closeDropdown();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeDropdown();
    }
    document.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  useIsomorphicLayoutEffect(() => {
    if (!open) return;
    searchRef.current?.focus();

    // Height is capped to exactly the available space and computed before
    // paint (useIsomorphicLayoutEffect), so the panel never has to visibly
    // resize into place, and re-measured on resize/scroll since those can
    // move the trigger. In "auto" mode it also picks whichever side (above
    // or below the trigger) has more room; "up" always opens above.
    const GAP = 6;
    const EDGE_PADDING = 8;
    const PREFERRED_HEIGHT = 288;

    function recalc() {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return;
      // The sticky header sits on top of the page while scrolled, so space
      // above the trigger stops at its bottom edge, not the viewport edge.
      const spaceAbove = rect.top - HEADER_HEIGHT - GAP - EDGE_PADDING;

      if (placement === "auto") {
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
        // Below MOBILE_NAV_BREAKPOINT the shared shell nav bar becomes a
        // fixed bottom bar (navBarClasses.ts) instead of a static sidebar,
        // overlapping whatever's beneath it -- measured live since it has
        // no fixed height (built from padding/icon/label sizing, not an
        // explicit h-* class).
        const navBarHeight =
          window.innerWidth < MOBILE_NAV_BREAKPOINT
            ? (document.querySelector("[data-shell-navbar]")?.getBoundingClientRect().height ?? 0)
            : 0;
        const spaceBelow = viewportHeight - rect.bottom - navBarHeight - GAP - EDGE_PADDING;
        const nextDirection = spaceBelow >= spaceAbove ? "down" : "up";
        const available = nextDirection === "down" ? spaceBelow : spaceAbove;
        setOpenDirection(nextDirection);
        setPanelMaxHeight(Math.max(0, Math.min(PREFERRED_HEIGHT, available)));
      } else {
        setOpenDirection("up");
        setPanelMaxHeight(Math.max(0, Math.min(PREFERRED_HEIGHT, spaceAbove)));
      }
    }

    recalc();
    window.visualViewport?.addEventListener("resize", recalc);
    window.addEventListener("resize", recalc);
    window.addEventListener("scroll", recalc, true);
    return () => {
      window.visualViewport?.removeEventListener("resize", recalc);
      window.removeEventListener("resize", recalc);
      window.removeEventListener("scroll", recalc, true);
    };
  }, [open, placement]);

  function selectCountry(code: string) {
    onChange(code);
    closeDropdown();
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => (open ? closeDropdown() : setOpen(true))}
        disabled={disabled || status === "loading"}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={TRIGGER_CLASS}
      >
        {selected ? (
          <>
            <FlagIcon code={selected.code} />
            <span className="flex-1 truncate">{selected.name}</span>
          </>
        ) : (
          <span className="flex-1 truncate text-text-muted">
            {status === "error" ? "Couldn't load countries" : status === "loading" ? "Loading…" : "Select a country"}
          </span>
        )}
        <svg viewBox="0 0 20 20" fill="currentColor" className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${open ? "rotate-180" : ""}`}>
          <path d="M5.25 7.5 10 12.25l4.75-4.75H5.25Z" />
        </svg>
      </button>

      {open && (
        <div
          role="listbox"
          style={{ maxHeight: panelMaxHeight }}
          className={`absolute left-0 right-0 z-50 flex flex-col overflow-hidden rounded-lg border border-border-soft bg-bg-main shadow-[0_12px_30px_rgba(0,0,0,0.5)] ${
            openDirection === "down" ? "top-[calc(100%+6px)]" : "bottom-[calc(100%+6px)]"
          }`}
        >
          <div className="min-h-0 flex-1 overflow-y-auto py-1">
            {filtered.length === 0 ? (
              <div className="px-3.5 py-2.5 text-[0.85rem] text-text-muted">No matches</div>
            ) : (
              filtered.map((c) => (
                <button
                  key={c.code}
                  type="button"
                  role="option"
                  aria-selected={c.code === value}
                  onClick={() => selectCountry(c.code)}
                  className={`flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[0.9rem] text-white transition-colors hover:bg-white/[0.06] ${
                    c.code === value ? "bg-accent-red/10" : ""
                  }`}
                >
                  <FlagIcon code={c.code} />
                  <span className="truncate">{c.name}</span>
                </button>
              ))
            )}
          </div>
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && filtered.length > 0) selectCountry(filtered[0].code);
            }}
            placeholder="Search countries…"
            className="w-full shrink-0 border-t border-border-soft bg-transparent px-3.5 py-2.5 text-[0.9rem] text-white outline-none placeholder:text-text-muted"
          />
        </div>
      )}
    </div>
  );
}
