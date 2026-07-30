"use client";

import { useState } from "react";
import { FaXmark, FaCheck } from "react-icons/fa6";

export function CheckoutBanner({ status }: { status: "success" | "cancel" }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  const bannerBase = "mb-6 flex flex-wrap items-center justify-between gap-4 rounded-xl px-5 py-4";
  const dismissClasses = "cursor-pointer bg-none p-1.5 text-text-muted [&>svg]:h-4 [&>svg]:w-4";
  const iconBase = "flex h-9 w-9 shrink-0 items-center justify-center rounded-full [&>svg]:h-4 [&>svg]:w-4";

  if (status === "success") {
    return (
      <div className={`${bannerBase} border border-accent-gold/30 bg-accent-gold/[0.08]`}>
        <div className="flex items-center gap-3">
          <div className={`${iconBase} bg-accent-gold/15 text-accent-gold`}>
            <FaCheck />
          </div>
          <div>
            <div className="text-[0.95rem] font-extrabold">You&apos;re now Premium!</div>
            <div className="text-sm text-text-muted">Daily limits are lifted. Manage your subscription anytime in Settings → Billing.</div>
          </div>
        </div>
        <button type="button" className={dismissClasses} onClick={() => setDismissed(true)} aria-label="Dismiss">
          <FaXmark />
        </button>
      </div>
    );
  }

  return (
    <div className={`${bannerBase} border border-dashed border-border-soft bg-white/[0.03]`}>
      <div className="flex items-center gap-3">
        <div className={`${iconBase} bg-white/[0.06] text-text-muted`}>
          <FaXmark />
        </div>
        <div>
          <div className="text-[0.95rem] font-extrabold">Checkout canceled</div>
          <div className="text-sm text-text-muted">No changes were made to your account.</div>
        </div>
      </div>
      <button type="button" className={dismissClasses} onClick={() => setDismissed(true)} aria-label="Dismiss">
        <FaXmark />
      </button>
    </div>
  );
}
