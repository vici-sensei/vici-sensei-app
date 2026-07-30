"use client";

import { useEffect, type ReactNode } from "react";

interface ModalProps {
  onClose: () => void;
  labelledBy?: string;
  children: ReactNode;
}

export function Modal({ onClose, labelledBy, children }: ModalProps) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="w-full max-w-[440px] rounded-2xl border border-border-soft bg-bg-cards p-7 shadow-[0_20px_60px_rgba(0,0,0,0.5)] backdrop-blur-[10px]"
      >
        {children}
      </div>
    </div>
  );
}
