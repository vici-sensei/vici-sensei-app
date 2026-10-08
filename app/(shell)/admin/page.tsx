"use client";

import Link from "next/link";
import { FaUserGraduate, FaInbox, FaLanguage } from "react-icons/fa6";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useAdminDashboardStats } from "@/lib/client-data/adminDashboard";
import { useKanjiWordsTodoCount } from "@/lib/client-data/adminKanjiWords";
import { isMultiRegionEnabled } from "@/lib/supabase/regions";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { PageHeader } from "@/app/components/ui/PageHeader";
import { Skeleton } from "@/app/components/ui/Skeleton";
import type { AdminDashboardStats } from "@/lib/types";

const TILES: { key: keyof AdminDashboardStats; label: string; tone?: "danger"; href?: string }[] = [
  { key: "leads_uncontacted", label: "Leads awaiting contact", tone: "danger", href: "/admin/leads" },
  { key: "new_leads_7d", label: "New leads this week", href: "/admin/leads" },
  { key: "active_today", label: "Active today" },
  { key: "active_7d", label: "Active this week" },
  { key: "total_students", label: "Total students" },
  { key: "new_students_7d", label: "New this week" },
];

export default function AdminOverviewPage() {
  const { user } = useAuth();
  const { data: stats, status } = useAdminDashboardStats(user);
  // The kanji-words RPCs only exist on the EU/US projects, so the tile (and its request) is multi-region only.
  const multiRegion = isMultiRegionEnabled();
  const { data: kanjiWords, status: kanjiWordsStatus } = useKanjiWordsTodoCount(multiRegion ? user : null);

  return (
    <div>
      <PageHeader
        breadcrumbs={[{ label: "Teacher" }]}
        title="Overview"
        subtitle="A quick look at how your students are doing."
      />

      <div className="mb-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
        {TILES.map((tile) => {
          const value = stats?.[tile.key] ?? 0;
          const highlight = tile.tone === "danger" && status === "loaded" && value > 0;
          const card = (
            <GlassCard
              padding="sm"
              tone={highlight ? "danger" : "default"}
              className={tile.href ? "transition-colors hover:bg-white/[0.03]" : undefined}
            >
              <div className="text-xs text-text-muted text-center sm:text-left">{tile.label}</div>
              <div className={`text-center sm:text-left mt-1 text-3xl font-extrabold ${highlight ? "text-accent-red" : ""}`}>
                {status === "loading" ? <Skeleton className="h-8 w-12" /> : value}
              </div>
            </GlassCard>
          );
          return tile.href ? (
            <Link key={tile.key} href={tile.href}>
              {card}
            </Link>
          ) : (
            <div key={tile.key}>{card}</div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Link href="/admin/students">
          <GlassCard padding="sm" className="flex items-center gap-4 transition-colors hover:bg-white/[0.03]">
            <FaUserGraduate className="h-6 w-6 text-accent-blue" />
            <div>
              <div className="font-bold">Students</div>
              <div className="text-sm text-text-muted">Progress, activity, and knowledge per student</div>
            </div>
          </GlassCard>
        </Link>
        <Link href="/admin/leads">
          <GlassCard padding="sm" className="flex items-center gap-4 transition-colors hover:bg-white/[0.03]">
            <FaInbox className="h-6 w-6 text-accent-gold" />
            <div>
              <div className="font-bold">Leads</div>
              <div className="text-sm text-text-muted">Free lesson signups waiting to be contacted</div>
            </div>
          </GlassCard>
        </Link>
        {multiRegion ? (
          <Link href="/admin/kanji-words">
            <GlassCard
              padding="sm"
              tone={kanjiWords && kanjiWords.algo_changed > 0 ? "danger" : "default"}
              className="flex items-center gap-4 transition-colors hover:bg-white/[0.03]"
            >
              <FaLanguage className="h-6 w-6 text-accent-green" />
              <div>
                <div className="font-bold">Kanji words</div>
                <div className="text-sm text-text-muted">
                  {kanjiWordsStatus === "loading" ? <Skeleton className="h-4 w-40" /> : null}
                  {kanjiWords
                    ? `${kanjiWords.to_review} kanji to review${
                        kanjiWords.algo_changed > 0 ? `, ${kanjiWords.algo_changed} with a changed algorithm result` : ""
                      }`
                    : kanjiWordsStatus === "error"
                      ? "Choose the words each kanji is taught with"
                      : null}
                </div>
              </div>
            </GlassCard>
          </Link>
        ) : null}
      </div>
    </div>
  );
}
