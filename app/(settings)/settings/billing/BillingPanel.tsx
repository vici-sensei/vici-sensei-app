"use client";

import { useState } from "react";
import { apiPost, ApiError } from "@/lib/api/client";
import { Badge } from "@/app/components/ui/Badge";
import { Button } from "@/app/components/ui/Button";

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
      <h2 className="mb-2 text-[1.7rem] font-extrabold leading-[1.2] tracking-[-0.8px]">Billing</h2>
      <p className="mb-6.5 text-base leading-[1.6] text-text-muted">Manage your Vici Sensei Premium subscription.</p>

      <div className="mb-5.5 rounded-2xl border border-border-soft bg-bg-cards px-8 py-[30px] backdrop-blur-[10px]">
        {isPremium ? (
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <span className="inline-flex items-center gap-2 text-[0.95rem] font-bold text-accent-gold before:h-2 before:w-2 before:rounded-full before:bg-accent-gold before:shadow-[0_0_8px_var(--color-accent-gold)] before:content-['']">
                Premium active
              </span>
              <p className="mt-2 text-[0.8rem] leading-normal text-text-muted">
                Renews monthly. Manage payment method, invoices, or cancel from the Stripe billing portal.
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => handleAction("/api/stripe/create-portal-session")}
              disabled={loading}
            >
              {loading ? "Redirecting…" : "Manage subscription"}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <Badge color="blue">Free plan</Badge>
              <ul className="mt-4 flex list-none flex-col gap-2.5 p-0">
                <li className="flex items-center gap-2.5 text-[0.92rem] text-text-muted [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0 [&>svg]:text-accent-gold">
                  <CheckIcon />
                  Unlimited daily new-card limits
                </li>
                <li className="flex items-center gap-2.5 text-[0.92rem] text-text-muted [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0 [&>svg]:text-accent-gold">
                  <CheckIcon />
                  Full N5–N1 vocabulary &amp; kanji sets
                </li>
                <li className="flex items-center gap-2.5 text-[0.92rem] text-text-muted [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0 [&>svg]:text-accent-gold">
                  <CheckIcon />
                  Priority support
                </li>
              </ul>
            </div>
            <Button onClick={() => handleAction("/api/stripe/create-checkout-session")} disabled={loading}>
              {loading ? "Redirecting…" : "Upgrade to Premium"}
            </Button>
          </div>
        )}
      </div>
      {error && <p className="mt-1.5 text-[0.8rem] leading-normal text-accent-red">{error}</p>}
    </div>
  );
}
