"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { FaChevronDown } from "react-icons/fa6";

function circleClasses(primary: boolean, colors: string): string {
  return `pointer-events-auto relative flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full transition-[opacity,scale,translate,box-shadow,background-color,border-color,color] duration-200 ease-out hover:-translate-y-0.5 starting:scale-50 starting:opacity-0 ${
    primary
      ? "shadow-[0_8px_30px_rgba(255,74,90,0.45)] hover:shadow-[0_8px_40px_rgba(255,74,90,0.65)]"
      : "border shadow-[0_8px_24px_rgba(0,0,0,0.45)]"
  } ${colors}`;
}

const PLAIN_COLORS = "border-white/10 bg-gray-900/95 text-text-muted hover:border-white/20 hover:text-white";

/**
 * Round buttons stacked at the bottom right of the editor. Sticky, so they stay in sight while the words scroll and
 * settle at the end of the list; only the circles themselves catch presses, the rest of the strip lets them through.
 */
export function FloatingDock({ children }: { children: ReactNode }) {
  return (
    <div
      data-floating-dock
      className="pointer-events-none sticky bottom-[max(1rem,env(safe-area-inset-bottom))] z-10 flex flex-col items-end gap-3"
    >
      {children}
    </div>
  );
}

interface FloatingCardProps {
  label: string;
  icon: ReactNode;
  /** The red circle; the others are dark. */
  primary?: boolean;
  /** Shown on the closed circle: a number in a bubble, or (dot) just a mark that something is there. */
  count?: number;
  /** What the count counts, for screen readers: "3 unsaved changes". */
  countNoun?: string;
  dot?: boolean;
  /** Which side of the dock the circle sits on; the card grows from there and keeps its chevron on that side. */
  side?: "right" | "left";
  /** Width cap of the open card, as a complete Tailwind class so the scanner sees it. */
  widthClassName?: string;
  open: boolean;
  onOpen: () => void;
  /** Kept stable by the caller: it's a dependency of the listeners the open card sets up. */
  onClose: () => void;
  children: ReactNode;
}

/**
 * A circle of the dock that grows into a card in its own place. The chevron in the card's corner, Escape or a press
 * outside the dock folds it back; a press on another circle of the dock opens that one's card instead. What was typed
 * in the card lives in the caller, so folding keeps it.
 */
export function FloatingCard({
  label,
  icon,
  primary = false,
  count = 0,
  countNoun = "unsaved change",
  dot = false,
  side = "right",
  widthClassName = "max-w-md",
  open,
  onOpen,
  onClose,
  children,
}: FloatingCardProps) {
  const cardId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const circleRef = useRef<HTMLButtonElement>(null);
  // Folded from the keyboard (Escape, the chevron): give focus back to the circle. Not after a press elsewhere,
  // which already put focus where the admin wanted it.
  const refocusCircle = useRef(false);

  useEffect(() => {
    if (!open) {
      if (refocusCircle.current) circleRef.current?.focus();
      refocusCircle.current = false;
      return;
    }
    const dock = cardRef.current?.closest("[data-floating-dock]");
    function onDown(e: PointerEvent) {
      if (dock && !dock.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      // A menu open inside the card (e.g. "Bulk actions") takes this Escape for itself.
      if (cardRef.current?.querySelector('[aria-haspopup][aria-expanded="true"]')) return;
      refocusCircle.current = true;
      onClose();
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (open) {
    return (
      <div
        ref={cardRef}
        id={cardId}
        className={`pointer-events-auto flex w-full ${widthClassName} ${
          side === "left" ? "origin-bottom-left flex-row-reverse" : "origin-bottom-right"
        } items-end gap-3 rounded-2xl border border-border-soft bg-gray-900/95 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-[10px] transition-[opacity,scale] duration-200 ease-out starting:scale-[0.15] starting:opacity-0`}
      >
        <div className="min-w-0 flex-1 space-y-3">{children}</div>
        <button
          type="button"
          onClick={() => {
            refocusCircle.current = true;
            onClose();
          }}
          aria-label={`Fold the ${label.toLowerCase()} card`}
          aria-expanded
          aria-controls={cardId}
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-full border border-border-soft text-text-muted transition-colors hover:border-white/20 hover:text-white"
        >
          <FaChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>
    );
  }

  return (
    <button
      ref={circleRef}
      type="button"
      onClick={onOpen}
      aria-label={count > 0 ? `${label} (${count} ${countNoun}${count === 1 ? "" : "s"})` : label}
      title={label}
      aria-expanded={false}
      aria-controls={cardId}
      className={circleClasses(primary, primary ? "bg-accent-red text-white" : PLAIN_COLORS)}
    >
      {icon}
      {count > 0 ? (
        <span className="absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-bg-main bg-accent-gold px-1 text-[0.68rem] font-extrabold leading-none text-gray-900">
          {count}
        </span>
      ) : dot ? (
        <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full border-2 border-bg-main bg-accent-blue" />
      ) : null}
    </button>
  );
}

interface FloatingToggleProps {
  label: string;
  icon: ReactNode;
  pressed: boolean;
  onToggle: () => void;
}

/** A circle of the dock that is a switch: filled green while on. */
export function FloatingToggle({ label, icon, pressed, onToggle }: FloatingToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={pressed}
      aria-label={label}
      title={label}
      className={circleClasses(false, pressed ? "border-accent-green bg-accent-green text-gray-900" : PLAIN_COLORS)}
    >
      {icon}
    </button>
  );
}
