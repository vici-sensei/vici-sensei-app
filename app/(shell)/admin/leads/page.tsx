"use client";

import { useAuth } from "@/lib/auth/AuthProvider";
import { useRequireAdmin } from "@/lib/auth/useRequireAdmin";
import { useFreeLessonLeads } from "@/lib/client-data/freeLessonLeads";
import { Breadcrumbs } from "@/app/components/ui/Breadcrumbs";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { Badge } from "@/app/components/ui/Badge";
import { Skeleton } from "@/app/components/ui/Skeleton";

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  dateStyle: "medium",
  timeStyle: "short",
});

function YesNo({ value }: { value: boolean }) {
  return value ? <Badge color="blue">Yes</Badge> : <span className="text-text-muted">No</span>;
}

export default function AdminLeadsPage() {
  const { user } = useAuth();
  const { ready, checking } = useRequireAdmin();
  const { data: leads, status } = useFreeLessonLeads(ready ? user : null);

  if (checking || !ready) return <FullScreenLoader />;

  return (
    <div>
      <Breadcrumbs items={[{ label: "Teacher", href: "/admin/students" }, { label: "Leads" }]} />
      <h1 className="mb-2 text-[2.1rem] font-extrabold leading-[1.2] tracking-[-0.8px] text-center md:text-left">Leads</h1>
      <p className="mb-7.5 text-base leading-[1.6] text-text-muted text-center md:text-left">
        Free lesson leads collected from the public signup form.
      </p>

      <GlassCard padding="sm" className="overflow-x-auto">
        <table className="w-full min-w-150 break-words text-left text-sm">
          <thead>
            <tr className="border-b border-border-soft text-text-muted">
              <th className="px-3 py-2.5 font-semibold">Name</th>
              <th className="px-3 py-2.5 font-semibold">WhatsApp</th>
              <th className="px-3 py-2.5 font-semibold">Consent</th>
              <th className="px-3 py-2.5 font-semibold">Contacted</th>
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
            {status === "loaded" && leads?.length === 0 && (
              <tr>
                <td className="px-3 py-6 text-center text-text-muted" colSpan={5}>
                  No leads yet.
                </td>
              </tr>
            )}
            {status === "loaded" &&
              leads?.map((lead) => (
                <tr key={lead.id} className="border-b border-border-soft/50 last:border-0">
                  <td className="max-w-[220px] break-words px-3 py-3 font-semibold">{lead.name}</td>
                  <td className="px-3 py-3">{lead.whatsapp}</td>
                  <td className="px-3 py-3">
                    <YesNo value={lead.consent} />
                  </td>
                  <td className="px-3 py-3">
                    <YesNo value={lead.contacted} />
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
