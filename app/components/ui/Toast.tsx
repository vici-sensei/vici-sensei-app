"use client";

import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from "react";
import { FaCheck, FaTriangleExclamation } from "react-icons/fa6";

type ToastType = "success" | "error";

interface ToastContextValue {
  showToast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const [type, setType] = useState<ToastType>("success");
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((msg: string, toastType: ToastType = "success") => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setMessage(msg);
    setType(toastType);
    setVisible(true);
    // Errors linger a bit longer than confirmations — still a toast, not a takeover.
    timeoutRef.current = setTimeout(() => setVisible(false), toastType === "error" ? 3600 : 2200);
  }, []);

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      <div
        className={`fixed bottom-7 left-1/2 z-[300] flex -translate-x-1/2 items-center gap-2 rounded-full border bg-gray-900/95 px-[22px] py-3 text-[0.88rem] font-bold text-white shadow-[0_20px_40px_rgba(0,0,0,0.5)] transition-[opacity,transform] duration-250 [&>svg]:h-[15px] [&>svg]:w-[15px] [&>svg]:shrink-0 ${
          type === "error" ? "border-accent-red/30 [&>svg]:text-accent-red" : "border-accent-blue/30 [&>svg]:text-accent-blue"
        } ${visible ? "translate-y-0 opacity-100 pointer-events-auto" : "translate-y-5 opacity-0 pointer-events-none"}`}
        role="status"
        aria-live="polite"
      >
        {type === "error" ? <FaTriangleExclamation /> : <FaCheck />}
        <span>{message}</span>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within a ToastProvider");
  return ctx;
}
