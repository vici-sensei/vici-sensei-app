"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch, ApiError } from "@/lib/api/client";
import { useToast } from "@/app/components/ui/Toast";
import type { UserProfile, UserProfilePatch } from "@/lib/types";

function initials(name: string | null, email: string) {
  const source = name?.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function ProfileSettingsForm({ initial }: { initial: UserProfile }) {
  const router = useRouter();
  const { showToast } = useToast();
  const [displayName, setDisplayName] = useState(initial.display_name ?? "");
  const [avatarUrl, setAvatarUrl] = useState(initial.avatar_url ?? "");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setSaving(true);
    setError(null);
    const body: UserProfilePatch = {};
    if (displayName.trim() !== (initial.display_name ?? "")) body.display_name = displayName.trim();
    if (avatarUrl.trim() !== (initial.avatar_url ?? "")) body.avatar_url = avatarUrl.trim();
    if (Object.keys(body).length === 0) {
      setSaving(false);
      return;
    }
    try {
      await apiPatch<UserProfile>("/api/user/me", body);
      setDirty(false);
      showToast("Profile saved");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save your profile.");
    } finally {
      setSaving(false);
    }
  }

  const previewInitials = initials(displayName, initial.email);
  const canSave = dirty && displayName.trim().length > 0 && displayName.trim().length <= 50;

  return (
    <div>
      <h2 className="main-title" style={{ fontSize: "1.7rem" }}>
        Profile
      </h2>
      <p className="subtitle" style={{ marginBottom: 26 }}>
        Update how your name and avatar appear in the app.
      </p>

      <div className="legal-company-card">
        <div className="avatar-row">
          <div className="avatar-preview">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- arbitrary user-supplied URL, any domain
              <img src={avatarUrl} alt="" />
            ) : (
              previewInitials
            )}
          </div>
          <div style={{ flex: 1 }}>
            <label className="field-label">Avatar URL</label>
            <input
              className="field-input"
              type="text"
              placeholder="https://..."
              value={avatarUrl}
              onChange={(e) => {
                setAvatarUrl(e.target.value);
                setDirty(true);
              }}
            />
          </div>
        </div>
        <div className="field-group">
          <label className="field-label">Display name</label>
          <input
            className="field-input"
            type="text"
            maxLength={50}
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setDirty(true);
            }}
          />
          <div className="field-hint">1–50 characters.</div>
        </div>
        <div className="field-group" style={{ marginBottom: 0 }}>
          <label className="field-label">Email</label>
          <input className="field-input" type="text" value={initial.email} readOnly />
          <div className="field-hint">Comes from your Google account — can&apos;t be changed here.</div>
        </div>
      </div>

      {error && (
        <p className="field-hint" style={{ color: "var(--color-accent-red)" }}>
          {error}
        </p>
      )}

      <div className="save-bar">
        <div className={`unsaved-note${dirty ? " show" : ""}`}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Unsaved changes
        </div>
        <button type="button" className="btn-primary" onClick={handleSave} disabled={saving || !canSave}>
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </div>
  );
}
