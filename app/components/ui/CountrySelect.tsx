"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useCountries } from "@/lib/client-data/countries";

// Native <option> elements can only render plain text -- no way to put a flag
// icon inside one -- so this is a custom listbox instead of a real <select>.
// A search box is included since the countries list has ~200 entries.

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
}: {
  id?: string;
  value: string | null;
  onChange: (code: string) => void;
  disabled?: boolean;
}) {
  const { data: countries, status } = useCountries();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [placement, setPlacement] = useState<"top" | "bottom">("bottom");
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

  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();

    // Flip the panel above the trigger when there isn't enough room below,
    // and cap its height to whatever space is actually available so it can
    // never run off the top/bottom edge of the viewport.
    const GAP = 6;
    const EDGE_PADDING = 8;
    const PREFERRED_HEIGHT = 288;
    const MIN_HEIGHT = 160;
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;

    const spaceBelow = window.innerHeight - rect.bottom - GAP - EDGE_PADDING;
    const spaceAbove = rect.top - GAP - EDGE_PADDING;
    const nextPlacement = spaceBelow >= MIN_HEIGHT || spaceBelow >= spaceAbove ? "bottom" : "top";
    const available = nextPlacement === "bottom" ? spaceBelow : spaceAbove;

    setPlacement(nextPlacement);
    setPanelMaxHeight(Math.max(MIN_HEIGHT, Math.min(PREFERRED_HEIGHT, available)));
  }, [open]);

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
            placement === "bottom" ? "top-[calc(100%+6px)]" : "bottom-[calc(100%+6px)]"
          }`}
        >
          <input
            ref={searchRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && filtered.length > 0) selectCountry(filtered[0].code);
            }}
            placeholder="Search countries…"
            className="w-full shrink-0 border-b border-border-soft bg-transparent px-3.5 py-2.5 text-[0.9rem] text-white outline-none placeholder:text-text-muted"
          />
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
        </div>
      )}
    </div>
  );
}
