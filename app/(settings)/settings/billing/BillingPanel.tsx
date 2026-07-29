"use client";

import { useState } from "react";
import { apiPost, ApiError } from "@/lib/api/client";
import { Badge } from "@/app/components/ui/Badge";

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}

export function BillingPanel({ isPremium }: { isPremium: boolean }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleAction(path: string) {
    setLoading(true);
    setError(null);
    try {
      const { url } = await apiPost<{ url: string }>(path);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not start the checkout flow.");
      setLoading(false);
    }
  }

  return (
    <div>
      <h2 className="main-title" style={{ fontSize: "1.7rem" }}>
        Billing
      </h2>
      <p className="subtitle" style={{ marginBottom: 26 }}>
        Manage your Vici Sensei Premium subscription.
      </p>

      <div className="legal-company-card">
        {isPremium ? (
          <div className="billing-card">
            <div>
              <span className="status-dot">Premium active</span>
              <p className="field-hint" style={{ marginTop: 8 }}>
                Renews monthly. Manage payment method, invoices, or cancel from the Stripe billing portal.
              </p>
            </div>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => handleAction("/api/stripe/create-portal-session")}
              disabled={loading}
            >
              {loading ? "Redirecting…" : "Manage subscription"}
            </button>
          </div>
        ) : (
          <div className="billing-card">
            <div>
              <Badge color="blue">Free plan</Badge>
              <ul className="billing-benefits">
                <li>
                  <CheckIcon />
                  Unlimited daily new-card limits
                </li>
                <li>
                  <CheckIcon />
                  Full N5–N1 vocabulary &amp; kanji sets
                </li>
                <li>
                  <CheckIcon />
                  Priority support
                </li>
              </ul>
            </div>
            <button
              type="button"
              className="btn-primary"
              onClick={() => handleAction("/api/stripe/create-checkout-session")}
              disabled={loading}
            >
              {loading ? "Redirecting…" : "Upgrade to Premium"}
            </button>
          </div>
        )}
      </div>
      {error && (
        <p className="field-hint" style={{ color: "var(--color-accent-red)" }}>
          {error}
        </p>
      )}
    </div>
  );
}
