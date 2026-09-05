"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { FaXmark } from "react-icons/fa6";

interface ModalProps {
  onClose: () => void;
  labelledBy?: string;
  /** Renders a built-in "x" button in the dialog's corner, wired to the same animated close as
   * Escape/backdrop-click. Opt-in per caller -- ConfirmDialog doesn't pass this, since it already
   * has its own Cancel button and doesn't need a second way to dismiss it. */
  showCloseButton?: boolean;
  children: ReactNode;
}

const TRANSITION_MS = 200;

/** Fades + scales in right after mount, and plays the same transition in reverse before actually
 * unmounting instead of just vanishing -- `closing` holds the dialog on screen for
 * TRANSITION_MS after Escape, a backdrop click, or the optional "x" button while the reverse
 * transition plays, and only then does the real `onClose` prop fire (removing this component
 * from its parent). A ref holds the latest `onClose` so the delayed setTimeout callback never
 * captures a stale one. The backdrop's own corners are rounded to match the dialog it holds --
 * see the design note this was requested against for why that's deliberate here, not a mistake. */
export function Modal({ onClose, labelledBy, showCloseButton, children }: ModalProps) {
  const [shown, setShown] = useState(false);
  const [closing, setClosing] = useState(false);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    // One tick after the initial (hidden) paint, so the transition from that state to visible
    // actually plays instead of the dialog just appearing already at rest.
    const id = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const closeAnimated = useCallback(() => {
    setClosing(true);
    setTimeout(() => onCloseRef.current(), TRANSITION_MS);
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeAnimated();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeAnimated]);

  const visible = shown && !closing;

  return (
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center rounded-2xl bg-black/70 px-4 backdrop-blur-sm transition-opacity duration-200 ${visible ? "opacity-100" : "opacity-0"}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeAnimated();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className={`relative w-full max-w-[440px] rounded-2xl border border-border-soft bg-bg-cards p-7 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-[10px] transition-all duration-200 ${
          visible ? "scale-100 opacity-100" : "scale-95 opacity-0"
        }`}
      >
        {showCloseButton && (
          <button
            type="button"
            onClick={closeAnimated}
            aria-label="Close"
            className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-border-soft text-text-muted transition-colors hover:text-white"
          >
            <FaXmark className="text-lg" />
          </button>
        )}
        {children}
      </div>
    </div>
  );
}
