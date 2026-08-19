"use client";

import { useState } from "react";
import { ApiError } from "@/lib/api/client";
import { createBillingPortalSession } from "@/lib/client-data/billing";
import { useToast } from "@/app/components/ui/Toast";
import { Badge } from "@/app/components/ui/Badge";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { Button, buttonClasses } from "@/app/components/ui/Button";
import { FaCheck } from "react-icons/fa6";

// Planurile sunt Stripe Payment Links (pagini găzduite de Stripe), nu sesiuni
// de Checkout create din cod — client_reference_id/prefilled_email în URL
// sunt ce leagă plata de contul userului pentru webhook (vezi app/api/stripe/webhook).
function buildPaymentLinkUrl(baseUrl: string, userId: string, email: string) {
  const url = new URL(baseUrl);
  url.searchParams.set("client_reference_id", userId);
  url.searchParams.set("prefilled_email", email);
  return url.toString();
}

export function BillingPanel({
  isPremium,
  hasStripeCustomer,
  userId,
  email,
}: {
  isPremium: boolean;
  hasStripeCustomer: boolean;
  userId: string;
  email: string;
}) {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  async function handleManageSubscription() {
    setLoading(true);
    try {
      const url = await createBillingPortalSession(`${window.location.origin}/settings/billing`);
      window.location.href = url;
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not start the checkout flow.", "error");
      setLoading(false);
    }
  }

  const monthlyLink = buildPaymentLinkUrl(
    process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK_MONTHLY!,
    userId,
    email
  );
  const yearlyLink = buildPaymentLinkUrl(
    process.env.NEXT_PUBLIC_STRIPE_PAYMENT_LINK_YEARLY!,
    userId,
    email
  );

  return (
    <div>
      <GlassCard padding="lg" className="mb-5.5">
        {isPremium && hasStripeCustomer ? (
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <span className="inline-flex items-center gap-2 text-[0.95rem] font-bold text-accent-gold before:h-2 before:w-2 before:rounded-full before:bg-accent-gold before:shadow-[0_0_8px_var(--color-accent-gold)] before:content-['']">
                Premium active
              </span>
              <p className="mt-2 text-[0.8rem] leading-normal text-text-muted">
                Renews monthly. Manage payment method, invoices, or cancel from the Stripe billing portal.
              </p>
            </div>
            <Button variant="secondary" onClick={handleManageSubscription} disabled={loading}>
              {loading ? "Redirecting…" : "Manage subscription"}
            </Button>
          </div>
        ) : isPremium ? (
          <div>
            <span className="inline-flex items-center gap-2 text-[0.95rem] font-bold text-accent-gold before:h-2 before:w-2 before:rounded-full before:bg-accent-gold before:shadow-[0_0_8px_var(--color-accent-gold)] before:content-['']">
              Premium active
            </span>
            <p className="mt-2 text-[0.8rem] leading-normal text-text-muted">
              Congratulations on enrolling in Vici Sensei&apos;s Japanese lessons! Your Premium access here is included
              with your mentorship, at no extra charge — there&apos;s nothing to manage on this page.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-6">
            <div>
              <Badge color="blue">Free plan</Badge>
              <ul className="mt-4 flex list-none flex-col gap-2.5 p-0">
                <li className="flex items-center gap-2.5 text-[0.92rem] text-text-muted [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0 [&>svg]:text-accent-gold">
                  <FaCheck />
                  Unlimited daily new-card limits
                </li>
                <li className="flex items-center gap-2.5 text-[0.92rem] text-text-muted [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0 [&>svg]:text-accent-gold">
                  <FaCheck />
                  Full N5–N1 vocabulary &amp; kanji sets
                </li>
                <li className="flex items-center gap-2.5 text-[0.92rem] text-text-muted [&>svg]:h-4 [&>svg]:w-4 [&>svg]:shrink-0 [&>svg]:text-accent-gold">
                  <FaCheck />
                  Priority support
                </li>
              </ul>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href={monthlyLink}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClasses({ hover: "hover" })}
              >
                $19 / 4 weeks
              </a>
              <a
                href={yearlyLink}
                target="_blank"
                rel="noopener noreferrer"
                className={buttonClasses({ variant: "secondary", hover: "hover" })}
              >
                $149 / year
              </a>
            </div>
          </div>
        )}
      </GlassCard>
    </div>
  );
}
