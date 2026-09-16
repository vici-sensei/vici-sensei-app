"use client";

import { useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useRequireAdmin } from "@/lib/auth/useRequireAdmin";
import { useFreeLessonLeads, updateLeadContacted } from "@/lib/client-data/freeLessonLeads";
import { Breadcrumbs } from "@/app/components/ui/Breadcrumbs";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { Badge } from "@/app/components/ui/Badge";
import { Toggle } from "@/app/components/ui/Toggle";
import { Skeleton } from "@/app/components/ui/Skeleton";
import type { FreeLessonLead } from "@/lib/types";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

type ContactedFilter = "all" | "contacted" | "uncontacted";

const FILTERS: { value: ContactedFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "contacted", label: "Contacted" },
  { value: "uncontacted", label: "Not contacted" },
];

export default function AdminLeadsPage() {
  const { user } = useAuth();
  const { ready, checking } = useRequireAdmin();
  const { data: leads, status } = useFreeLessonLeads(ready ? user : null);
  const [filter, setFilter] = useState<ContactedFilter>("all");
  // Optimistic per-row overrides for the contacted toggle, keyed by lead id -- keeps the UI
  // snappy without waiting on a full refetch, and reverts silently if the write fails.
  const [contactedOverrides, setContactedOverrides] = useState<Record<number, boolean>>({});
  const [pendingIds, setPendingIds] = useState<Set<number>>(new Set());

  if (checking || !ready) return <FullScreenLoader />;

  async function handleToggleContacted(lead: FreeLessonLead) {
    if (pendingIds.has(lead.id)) return;
    const current = contactedOverrides[lead.id] ?? lead.contacted;
    const next = !current;
    setContactedOverrides((prev) => ({ ...prev, [lead.id]: next }));
    setPendingIds((prev) => new Set(prev).add(lead.id));
    try {
      await updateLeadContacted(lead.id, next);
    } catch {
      setContactedOverrides((prev) => {
        const copy = { ...prev };
        delete copy[lead.id];
        return copy;
      });
    } finally {
      setPendingIds((prev) => {
        const copy = new Set(prev);
        copy.delete(lead.id);
        return copy;
      });
    }
  }

  const visibleLeads = leads?.filter((lead) => {
    const contacted = contactedOverrides[lead.id] ?? lead.contacted;
    if (filter === "contacted") return contacted;
    if (filter === "uncontacted") return !contacted;
    return true;
  });

  return (
    <div>
      <Breadcrumbs items={[{ label: "Teacher", href: "/admin" }, { label: "Leads" }]} />
      <h1 className="mb-2 text-[2.1rem] font-extrabold leading-[1.2] tracking-[-0.8px] text-center md:text-left">Leads</h1>
      <p className="mb-7.5 text-base leading-[1.6] text-text-muted text-center md:text-left">
        Free lesson leads collected from the public signup form.
      </p>

      <div className="mb-4.5 flex flex-wrap justify-center gap-2 md:justify-start">
        {FILTERS.map(({ value, label }) => (
          <button
            key={value}
            type="button"
            className={`cursor-pointer rounded-xl border px-4 py-[11px] text-[0.85rem] font-extrabold transition-all ${
              filter === value
                ? "border-accent-blue/35 bg-accent-blue/[0.12] text-accent-blue"
                : "border-border-soft bg-white/[0.03] text-text-muted hover:border-white/20"
            }`}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      <GlassCard padding="sm" className="overflow-x-auto">
        <table className="w-full min-w-150 break-words text-left text-sm">
          <thead>
            <tr className="border-b border-border-soft text-text-muted">
              <th className="px-3 py-2.5 font-semibold">Contacted</th>
              <th className="px-3 py-2.5 font-semibold">Name</th>
              <th className="px-3 py-2.5 font-semibold">WhatsApp</th>
              <th className="px-3 py-2.5 font-semibold">Consent</th>
              <th className="px-3 py-2.5 font-semibold">Submitted</th>
            </tr>
          </thead>
          <tbody>
            {status === "loading" &&
              Array.from({ length: 3 }).map((_, i) => (
                <tr key={i} className="border-b border-border-soft/50">
                  <td className="px-3 py-3" colSpan={5}>
                    <Skeleton className="h-5 w-full" />
                  </td>
                </tr>
              ))}
            {status === "error" && (
              <tr>
                <td className="px-3 py-6 text-center text-text-muted" colSpan={5}>
                  Failed to load leads.
                </td>
              </tr>
            )}
            {status === "loaded" && visibleLeads?.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-text-muted" colSpan={5}>
                  No leads to show.
                </td>
              </tr>
            )}
            {status === "loaded" &&
              visibleLeads?.map((lead) => (
                <tr key={lead.id} className="border-b border-border-soft/50 last:border-0">
                  <td className="px-3 py-3">
                    <Toggle
                      checked={contactedOverrides[lead.id] ?? lead.contacted}
                      onChange={() => handleToggleContacted(lead)}
                      color="blue"
                      aria-label={`Mark ${lead.name} as contacted`}
                    />
                  </td>
                  <td className="max-w-[220px] break-words px-3 py-3 font-semibold">{lead.name}</td>
                  <td className="px-3 py-3">{lead.whatsapp}</td>
                  <td className="px-3 py-3">
                    {lead.consent ? <Badge color="blue">Yes</Badge> : <span className="text-text-muted">No</span>}
                  </td>
                  <td className="px-3 py-3 text-text-muted">{dateFormatter.format(new Date(lead.created_at))}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </GlassCard>
    </div>
  );
}
