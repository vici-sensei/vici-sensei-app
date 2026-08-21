"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useCountries } from "@/lib/client-data/countries";
import { FlagPlaceholder } from "./FlagPlaceholder";
import { useFlagIconsCss } from "./useFlagIconsCss";

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
  loading,
  placement = "up",
}: {
  id?: string;
  value: string | null;
  onChange: (code: string) => void;
  disabled?: boolean;
  /** True while the value this select shows is still a placeholder (e.g. the profile row
   * hasn't loaded yet) -- renders a gray flag + skeleton bar in place of the trigger's usual
   * content instead of "Select a country", and locks the trigger the same as `disabled`. */
  loading?: boolean;
  /** "up" always opens above the trigger (default). "auto" opens whichever side has more room. */
  placement?: "up" | "auto";
}) {
  useFlagIconsCss();
  const { data: countries, status } = useCountries();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [openDirection, setOpenDirection] = useState<"up" | "down">("up");
  const [panelMaxHeight, setPanelMaxHeight] = useState(288);
  // Lazy-initialized from window.innerWidth (not an effect) so a dropdown opened on the very
  // first interaction already knows it's mobile -- no one-frame flash of the desktop panel.
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < MOBILE_NAV_BREAKPOINT);
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
    function onResize() {
      setIsMobile(window.innerWidth < MOBILE_NAV_BREAKPOINT);
    }
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // On mobile the panel is a fullscreen portal, so there's no "outside" to click and no
  // background to scroll -- lock body scroll instead of the desktop click-outside-to-close.
  useEffect(() => {
    if (!open || !isMobile) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open, isMobile]);

  useEffect(() => {
    if (!open || isMobile) return;
    function onPointerDown(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) closeDropdown();
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open, isMobile]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeDropdown();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useIsomorphicLayoutEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    if (isMobile) return; // fullscreen mobile panel has no position/height math to do

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
  }, [open, placement, isMobile]);

  function selectCountry(code: string) {
    onChange(code);
    closeDropdown();
  }

  // `big` bumps padding/text size for comfortable thumb targets in the mobile fullscreen panel.
  function renderOptions(big: boolean) {
    if (filtered.length === 0) {
      return <div className={`text-text-muted ${big ? "px-4 py-3 text-[0.95rem]" : "px-3.5 py-2.5 text-[0.85rem]"}`}>No matches</div>;
    }
    return filtered.map((c) => (
      <button
        key={c.code}
        type="button"
        role="option"
        aria-selected={c.code === value}
        onClick={() => selectCountry(c.code)}
        className={`flex w-full items-center text-left text-white transition-colors hover:bg-white/[0.06] ${
          big ? "gap-3 px-4 py-3.5 text-[1rem]" : "gap-2.5 px-3.5 py-2 text-[0.9rem]"
        } ${c.code === value ? "bg-accent-red/10" : ""}`}
      >
        <FlagIcon code={c.code} />
        <span className="truncate">{c.name}</span>
      </button>
    ));
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        id={id}
        type="button"
        onClick={() => (open ? closeDropdown() : setOpen(true))}
        disabled={disabled || loading || status === "loading"}
        aria-haspopup="listbox"
        aria-expanded={open}
        className={TRIGGER_CLASS}
      >
        {loading ? (
          <>
            <FlagPlaceholder />
            <span className="h-3.5 flex-1 animate-pulse rounded-md bg-white/10" />
          </>
        ) : selected ? (
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

      {open && !isMobile && (
        <div
          role="listbox"
          style={{ maxHeight: panelMaxHeight }}
          className={`absolute left-0 right-0 z-50 flex flex-col overflow-hidden rounded-lg border border-border-soft bg-bg-main shadow-[0_12px_30px_rgba(0,0,0,0.5)] ${
            openDirection === "down" ? "top-[calc(100%+6px)]" : "bottom-[calc(100%+6px)]"
          }`}
        >
          <div className="min-h-0 flex-1 overflow-y-auto py-1">{renderOptions(false)}</div>
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

      {open &&
        isMobile &&
        createPortal(
          // Fullscreen like a native <select> on mobile. `h-dvh` (not inset-0/bottom-0) is what
          // makes the panel actually shrink when the on-screen keyboard opens -- dvh tracks the
          // visual viewport, so the list area loses exactly the height the keyboard covers, and
          // the search input never ends up hidden behind it. Rendered via portal so it escapes
          // any parent form's stacking/overflow context instead of being clipped or z-fought.
          <div role="dialog" aria-modal="true" aria-label="Select a country" className="fixed inset-x-0 top-0 z-[200] flex h-dvh flex-col bg-bg-main">
            <div
              className="flex shrink-0 items-center gap-2 border-b border-border-soft px-3 pb-3"
              style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top))" }}
            >
              <button
                type="button"
                onClick={closeDropdown}
                aria-label="Close"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors hover:bg-white/[0.06] hover:text-white"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
                  <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
                </svg>
              </button>
              <span className="text-[1.05rem] font-bold text-white">Select a country</span>
            </div>

            <div className="shrink-0 border-b border-border-soft px-4 py-3">
              <input
                ref={searchRef}
                type="text"
                inputMode="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && filtered.length > 0) selectCountry(filtered[0].code);
                }}
                placeholder="Search countries…"
                className="w-full rounded-lg border border-border-soft bg-white/[0.03] px-3.5 py-3 text-[1rem] text-white outline-none focus:border-white/30 placeholder:text-text-muted"
              />
            </div>

            <div
              role="listbox"
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1"
              style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            >
              {renderOptions(true)}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
