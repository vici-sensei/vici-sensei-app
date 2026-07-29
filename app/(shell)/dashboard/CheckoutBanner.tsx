"use client";

import { useState } from "react";

function DismissIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

export function CheckoutBanner({ status }: { status: "success" | "cancel" }) {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;

  if (status === "success") {
    return (
      <div className="checkout-banner success">
        <div className="cb-left">
          <div className="cb-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
          </div>
          <div>
            <div className="cb-title">You&apos;re now Premium!</div>
            <div className="cb-sub">Daily limits are lifted. Manage your subscription anytime in Settings → Billing.</div>
          </div>
        </div>
        <button type="button" className="cb-dismiss" onClick={() => setDismissed(true)} aria-label="Dismiss">
          <DismissIcon />
        </button>
      </div>
    );
  }

  return (
    <div className="checkout-banner cancel">
      <div className="cb-left">
        <div className="cb-icon">
          <DismissIcon />
        </div>
        <div>
          <div className="cb-title">Checkout canceled</div>
          <div className="cb-sub">No changes were made to your account.</div>
        </div>
      </div>
      <button type="button" className="cb-dismiss" onClick={() => setDismissed(true)} aria-label="Dismiss">
        <DismissIcon />
      </button>
    </div>
  );
}
