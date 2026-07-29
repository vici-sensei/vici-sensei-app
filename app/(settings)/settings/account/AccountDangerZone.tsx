"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api/client";
import { createClient } from "@/lib/supabase/client";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { Button } from "@/app/components/ui/Button";

export function AccountDangerZone() {
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [word, setWord] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirmed && word.trim().toUpperCase() === "DELETE";

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      await apiFetch("/api/user/me", { method: "DELETE" });
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not delete your account. Please try again.");
      setDeleting(false);
    }
  }

  return (
    <div>
      <h2 className="main-title text-[1.7rem]">Account</h2>
      <p className="subtitle mb-6.5">Permanently delete your Vici Sensei account.</p>

      <GlassCard tone="danger" padding="lg">
        <div className="mb-1 flex items-center gap-2.5">
          <svg
            className="h-5 w-5 text-accent-red"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <strong className="text-[1.05rem]">This can&apos;t be undone</strong>
        </div>
        <p className="mt-2.5 text-[0.8rem] leading-normal text-text-muted">Deleting your account permanently removes:</p>
        <ul className="mt-3.5 mb-5 list-disc pl-5 text-[0.9rem] leading-[1.8] text-text-muted">
          <li>All kanji, reading, and vocabulary progress</li>
          <li>Your full review history and study sessions</li>
          <li>Your active Premium subscription (cancelled automatically)</li>
        </ul>
        <label className="my-5 flex items-start gap-2.5 text-[0.9rem] text-text-muted">
          <input
            type="checkbox"
            className="mt-[3px] h-4 w-4 shrink-0 accent-accent-red"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          I understand this action is permanent and cannot be reversed.
        </label>
        <div className="mb-[22px]">
          <label className="mb-2 block text-sm font-bold uppercase tracking-[0.6px] text-text-muted">
            Type <strong className="text-white">DELETE</strong> to confirm
          </label>
          <input
            className="w-full rounded-lg border border-border-soft bg-white/[0.03] px-3.5 py-3 font-mono tracking-[1px] text-[0.95rem] text-white outline-none transition-colors focus:border-accent-blue/40"
            type="text"
            placeholder="DELETE"
            value={word}
            onChange={(e) => setWord(e.target.value)}
          />
        </div>
        {error && <p className="mt-1.5 text-[0.8rem] leading-normal text-accent-red">{error}</p>}
        <Button danger className="w-full" disabled={!canDelete || deleting} onClick={handleDelete}>
          {deleting ? "Deleting…" : "Delete my account permanently"}
        </Button>
      </GlassCard>
    </div>
  );
}
