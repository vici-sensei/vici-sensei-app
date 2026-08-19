"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ApiError } from "@/lib/api/client";
import { createClient } from "@/lib/supabase/client";
import { deleteAccount } from "@/lib/client-data/account";
import { useToast } from "@/app/components/ui/Toast";
import { Button } from "@/app/components/ui/Button";
import { SettingsHeader } from "@/app/components/ui/SettingsHeader";
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
      const { pendingDeletionAt } = await deleteAccount();
      // Navigate off the auth-guarded /settings layout *before* signing out --
      // signOut() flips the auth state to "anon" synchronously, and if we're
      // still mounted under that layout when it does, its own useRequireAuth
      // redirect to /login wins the race against this one.
      router.push(`/account-deletion?until=${encodeURIComponent(pendingDeletionAt)}`);
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not delete your account. Please try again.", "error");
      setDeleting(false);
    }
  }

  return (
    <div>
      <SettingsHeader title="Account" description="Delete your Vici Sensei account." />

      <div className="space-y-10">
        <div className="space-y-2.5">
          <div className="flex items-center gap-2.5">
            <FaTriangleExclamation className="h-5 w-5 text-accent-red" />
            <strong className="text-[1.05rem]">You&apos;ll have 30 days to change your mind</strong>
          </div>
          <p className="text-[0.8rem] leading-normal text-text-muted">
            We won&apos;t delete anything right away. Instead, your account is deactivated and quietly waits for 30
            days — if you log back in during that time, everything is restored automatically and you can carry on
            right where you left off. No questions asked, nothing to undo yourself.
          </p>
          <p className="text-[0.8rem] leading-normal text-text-muted">
            If the 30 days pass and you haven&apos;t logged back in, we&apos;ll permanently erase:
          </p>
          <ul className="list-disc pl-5 text-[0.9rem] leading-[1.8] text-text-muted">
            <li>All kanji, reading, and vocabulary progress</li>
            <li>Your full review history and study sessions</li>
            <li>Your active Premium subscription (cancelled right away, so you won&apos;t be charged during the wait)</li>
          </ul>
        </div>

        <div className="space-y-4">
          <label className="flex items-start gap-2.5 text-[0.9rem] text-text-muted">
            <input
              type="checkbox"
              className="mt-[3px] h-4 w-4 shrink-0 accent-accent-red cursor-pointer"
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            <span className="cursor-text">
              I understand my account will be permanently deleted after 30 days unless I log back in.
            </span>
          </label>
          <div className="max-w-sm">
            <label className="mb-2 block text-sm font-bold uppercase tracking-[0.6px] text-text-muted">
              Type <strong className="text-white">DELETE</strong> to confirm
            </label>
            <input
              className="w-full rounded-lg border border-border-soft bg-white/[0.03] px-3.5 py-3 font-mono tracking-[1px] text-[0.95rem] text-white outline-none transition-colors focus:border-accent-red/40"
              type="text"
              placeholder="DELETE"
              value={word}
              onChange={(e) => setWord(e.target.value.toUpperCase())}
              onFocus={scrollIntoViewOnFocus}
            />
          </div>
        </div>

        <Button danger className="w-full max-w-sm" disabled={!canDelete || deleting} onClick={handleDelete}>
          {deleting ? "Scheduling" : "Delete my account"}
        </Button>
      </div>
    </div>
  );
}
