import Link from "next/link";
import { fetchServer } from "@/lib/api/server";
import type { StudyStats } from "@/lib/types";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { DashboardHero } from "./DashboardHero";
import { CheckoutBanner } from "./CheckoutBanner";
import { FaBook, FaPenToSquare, FaFire, FaClock, FaArrowRight } from "react-icons/fa6";

interface DashboardPageProps {
  searchParams: Promise<{ checkout?: string }>;
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const { checkout } = await searchParams;
  const stats = await fetchServer<StudyStats>("/api/study/stats");

  return (
    <div>
      {(checkout === "success" || checkout === "cancel") && <CheckoutBanner status={checkout} />}

      <DashboardHero initialStats={stats} />

      <div className="mt-7 grid grid-cols-2 gap-[18px] md:grid-cols-4">
        <GlassCard padding="sm">
          <div className="mb-3.5 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-blue/10 text-accent-blue">
            <FaBook className="h-4 w-4" />
          </div>
          <div className="mb-1.5 text-3xl font-extrabold leading-none tracking-tight">
            {stats.new_kanji_today}
            <span className="text-[1.1rem] text-text-muted">/{stats.new_kanji_limit}</span>
          </div>
          <div className="text-sm font-semibold text-text-muted">New kanji today</div>
        </GlassCard>

        <GlassCard padding="sm">
          <div className="mb-3.5 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-blue/10 text-accent-blue">
            <FaPenToSquare className="h-4 w-4" />
          </div>
          <div className="mb-1.5 text-3xl font-extrabold leading-none tracking-tight">
            {stats.new_vocab_today}
            <span className="text-[1.1rem] text-text-muted">/{stats.new_vocab_limit}</span>
          </div>
          <div className="text-sm font-semibold text-text-muted">New vocab today</div>
        </GlassCard>

        <GlassCard padding="sm">
          <div className="mb-3.5 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-gold/[0.12] text-accent-gold">
            <FaFire className="h-4 w-4" />
          </div>
          <div className="mb-1.5 text-3xl font-extrabold leading-none tracking-tight text-accent-gold">{stats.streak}</div>
          <div className="text-sm font-semibold text-text-muted">Day streak</div>
        </GlassCard>

        <GlassCard padding="sm">
          <div className="mb-3.5 flex h-9 w-9 items-center justify-center rounded-lg bg-accent-red/10 text-accent-red">
            <FaClock className="h-4 w-4" />
          </div>
          <div
            className={
              stats.retention_rate != null
                ? "mb-1.5 text-3xl font-extrabold leading-none tracking-tight"
                : "mb-1.5 text-3xl font-semibold leading-none tracking-tight text-text-muted"
            }
          >
            {stats.retention_rate != null ? `${Math.round(stats.retention_rate * 100)}%` : "N/A"}
          </div>
          <div className="text-sm font-semibold text-text-muted">Retention (30d)</div>
        </GlassCard>
      </div>

      <Link
        className="mt-6 inline-flex items-center gap-1.5 text-sm font-bold text-text-muted transition-[color,gap] duration-200 hover:gap-2.5 hover:text-white"
        href="/progress"
      >
        View detailed progress
        <FaArrowRight className="h-4 w-4" />
      </Link>
    </div>
  );
}
