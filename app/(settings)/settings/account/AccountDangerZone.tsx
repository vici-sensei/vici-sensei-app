"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, ApiError } from "@/lib/api/client";
import { createClient } from "@/lib/supabase/client";

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
      <h2 className="main-title" style={{ fontSize: "1.7rem" }}>
        Account
      </h2>
      <p className="subtitle" style={{ marginBottom: 26 }}>
        Permanently delete your Vici Sensei account.
      </p>

      <div className="legal-company-card danger-card">
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
          <svg
            style={{ width: 20, height: 20, color: "var(--color-accent-red)" }}
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
          <strong style={{ fontSize: "1.05rem" }}>This can&apos;t be undone</strong>
        </div>
        <p className="field-hint" style={{ margin: "10px 0 0" }}>
          Deleting your account permanently removes:
        </p>
        <ul className="danger-list">
          <li>All kanji, reading, and vocabulary progress</li>
          <li>Your full review history and study sessions</li>
          <li>Your active Premium subscription (cancelled automatically)</li>
        </ul>
        <label className="confirm-row">
          <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
          I understand this action is permanent and cannot be reversed.
        </label>
        <div className="field-group">
          <label className="field-label">
            Type <strong style={{ color: "#fff" }}>DELETE</strong> to confirm
          </label>
          <input
            className="field-input confirm-word-input"
            type="text"
            placeholder="DELETE"
            value={word}
            onChange={(e) => setWord(e.target.value)}
          />
        </div>
        {error && (
          <p className="field-hint" style={{ color: "var(--color-accent-red)" }}>
            {error}
          </p>
        )}
        <button
          type="button"
          className="btn-primary btn-danger"
          disabled={!canDelete || deleting}
          onClick={handleDelete}
          style={{ width: "100%" }}
        >
          {deleting ? "Deleting…" : "Delete my account permanently"}
        </button>
      </div>
    </div>
  );
}
