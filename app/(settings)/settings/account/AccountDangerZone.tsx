"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { createClient } from "@/lib/supabase/client";
import { deleteAccount } from "@/lib/client-data/account";
import { useToast } from "@/app/components/ui/Toast";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { Button } from "@/app/components/ui/Button";
import { scrollIntoViewOnFocus } from "@/lib/scrollFocus";
import { FaTriangleExclamation } from "react-icons/fa6";

export function AccountDangerZone() {
  const router = useRouter();
  const { showToast } = useToast();
  const [confirmed, setConfirmed] = useState(false);
  const [word, setWord] = useState("");
  const [deleting, setDeleting] = useState(false);

  const canDelete = confirmed && word.trim().toUpperCase() === "DELETE";

  async function handleDelete() {
    setDeleting(true);
    try {
      await deleteAccount();
      const supabase = createClient();
      await supabase.auth.signOut();
      router.push("/login");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not delete your account. Please try again.", "error");
      setDeleting(false);
    }
  }

  return (
    <div>
      <h2 className="mb-2 text-[1.7rem] font-extrabold leading-[1.2] tracking-[-0.8px]">Account</h2>
      <p className="mb-6.5 text-base leading-[1.6] text-text-muted">Permanently delete your Vici Sensei account.</p>

      <GlassCard tone="danger" padding="lg">
        <div className="mb-1 flex items-center gap-2.5">
          <FaTriangleExclamation className="h-5 w-5 text-accent-red" />
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
            className="mt-[3px] h-4 w-4 shrink-0 accent-accent-red cursor-pointer"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
          />
          <span className="cursor-text">I understand this action is permanent and cannot be reversed.</span>
        </label>
        <div className="mb-[22px]">
          <label className="mb-2 block text-sm font-bold uppercase tracking-[0.6px] text-text-muted">
            Type <strong className="text-white">DELETE</strong> to confirm
          </label>
          <input
            className="w-full rounded-lg border border-border-soft bg-white/[0.03] px-3.5 py-3 font-mono tracking-[1px] text-[0.95rem] text-white outline-none transition-colors focus:border-accent-red/40"
            type="text"
            placeholder="DELETE"
            value={word}
            onChange={(e) => setWord(e.target.value)}
            onFocus={scrollIntoViewOnFocus}
          />
        </div>
        <Button danger className="w-full" disabled={!canDelete || deleting} onClick={handleDelete}>
          {deleting ? "Deleting…" : "Delete my account permanently"}
        </Button>
      </GlassCard>
    </div>
  );
}
