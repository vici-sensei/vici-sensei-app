"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { FaXmark } from "react-icons/fa6";

interface ModalProps {
  onClose: () => void;
  labelledBy?: string;
  /** Renders a built-in "x" button in the dialog's corner, wired to the same animated close as
   * Escape/backdrop-click. Opt-in per caller -- ConfirmDialog doesn't pass this, since it already
   * has its own Cancel button and doesn't need a second way to dismiss it. */
  showCloseButton?: boolean;
  /** Edge-to-edge over the whole app viewport instead of a centered card -- for content (a full-
   * size image) that should fill the screen rather than sit in a bounded dialog box. Also grows
   * the close button to a size that's actually easy to tap on a phone. Rendered through a portal
   * into document.body so it isn't affected by an opacity/grayscale ancestor (e.g. a "locked"
   * card) the way a plain fixed-position descendant would still be. */
  fullScreen?: boolean;
  children: ReactNode;
}

const TRANSITION_MS = 200;

/** Fades + scales in right after mount, and plays the same transition in reverse before actually
 * unmounting instead of just vanishing -- `closing` holds the dialog on screen for
 * TRANSITION_MS after Escape, a backdrop click, or the optional "x" button while the reverse
 * transition plays, and only then does the real `onClose` prop fire (removing this component
 * from its parent). A ref holds the latest `onClose` so the delayed setTimeout callback never
 * captures a stale one. The backdrop's own corners are rounded to match the dialog it holds --
 * see the design note this was requested against for why that's deliberate here, not a mistake.
 * The non-fullScreen card is `isolate overflow-hidden`: some callers (e.g. NewAchievementsModal)
 * layer SakuraPetals behind their content inside this card, and both clip the petals to the
 * rounded corners and keep the card's own z-index comparisons (petals vs. content) from ever
 * being compared against anything outside the card. */
export function Modal({ onClose, labelledBy, showCloseButton, fullScreen, children }: ModalProps) {
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

  useEffect(() => {
    // Blurs whatever input/textarea was focused behind this modal (e.g. the study page's
    // answer field, which stays focused across cards) so the on-screen keyboard closes instead
    // of covering the dialog -- most callers open this from a button tap, which already blurs
    // the previous field, but async triggers like the level-up/graduation modals don't.
    (document.activeElement as HTMLElement | null)?.blur?.();
  }, []);

  const closeAnimated = useCallback(() => {
    setClosing((already) => {
      if (!already) setTimeout(() => onCloseRef.current(), TRANSITION_MS);
      return true;
    });
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeAnimated();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeAnimated]);

  const visible = shown && !closing;

  const dialog = (
    <div
      className={`fixed inset-0 z-[200] flex items-center justify-center bg-black/70 backdrop-blur-sm transition-opacity duration-200 ${
        fullScreen ? "" : "rounded-2xl px-4"
      } ${visible ? "opacity-100" : "opacity-0"}`}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeAnimated();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        // Fullscreen only: closes on any click that reaches this element at all -- not just a
        // direct hit (target === currentTarget) the way the backdrop's own handler above works.
        // The actual content (image + title + description) stops this event from bubbling this
        // far, so "reaches here" already means "outside the content", including the empty flex
        // space around/between it, not just the dialog's own padding.
        onMouseDown={fullScreen ? () => closeAnimated() : undefined}
        className={
          fullScreen
            ? `relative flex h-full w-full flex-col items-center justify-center p-4 transition-all duration-200 ${
                visible ? "scale-100 opacity-100" : "scale-95 opacity-0"
              }`
            : `relative isolate w-full max-w-[440px] overflow-hidden rounded-2xl border border-border-soft bg-bg-cards p-7 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-[10px] transition-all duration-200 ${
                visible ? "scale-100 opacity-100" : "scale-95 opacity-0"
              }`
        }
      >
        {showCloseButton && (
          <button
            type="button"
            onClick={closeAnimated}
            aria-label="Close"
            className={
              fullScreen
                ? "absolute right-4 top-4 flex h-14 w-14 items-center justify-center text-white transition-opacity hover:opacity-70"
                : "absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-border-soft text-text-muted transition-colors hover:text-white"
            }
          >
            <FaXmark className={fullScreen ? "text-3xl drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]" : "text-lg"} />
          </button>
        )}
        {children}
      </div>
    </div>
  );

  return fullScreen ? createPortal(dialog, document.body) : dialog;
}
