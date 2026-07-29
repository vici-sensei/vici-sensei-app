"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch, ApiError } from "@/lib/api/client";
import { useToast } from "@/app/components/ui/Toast";
import { Button } from "@/app/components/ui/Button";
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

  const fieldLabel = "mb-2 block text-sm font-bold uppercase tracking-[0.6px] text-text-muted";
  const fieldInput =
    "w-full rounded-lg border border-border-soft bg-white/[0.03] px-3.5 py-3 text-[0.95rem] text-white outline-none transition-colors focus:border-accent-blue/40 read-only:cursor-not-allowed read-only:text-text-muted";
  const fieldHint = "mt-1.5 text-[0.8rem] leading-normal text-text-muted";

  return (
    <div>
      <h2 className="main-title text-[1.7rem]">Profile</h2>
      <p className="subtitle mb-6.5">Update how your name and avatar appear in the app.</p>

      <div className="mb-5.5 rounded-2xl border border-border-soft bg-bg-cards px-8 py-[30px] backdrop-blur-[10px]">
        <div className="mb-6.5 flex items-center gap-5">
          <div className="flex h-18 w-18 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/15 bg-gradient-to-br from-accent-blue/35 to-accent-red/35 text-[1.4rem] font-extrabold text-white">
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- arbitrary user-supplied URL, any domain
              <img src={avatarUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              previewInitials
            )}
          </div>
          <div className="flex-1">
            <label className={fieldLabel}>Avatar URL</label>
            <input
              className={fieldInput}
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
        <div className="mb-[22px]">
          <label className={fieldLabel}>Display name</label>
          <input
            className={fieldInput}
            type="text"
            maxLength={50}
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setDirty(true);
            }}
          />
          <div className={fieldHint}>1–50 characters.</div>
        </div>
        <div>
          <label className={fieldLabel}>Email</label>
          <input className={fieldInput} type="text" value={initial.email} readOnly />
          <div className={fieldHint}>Comes from your Google account — can&apos;t be changed here.</div>
        </div>
      </div>

      {error && <p className="mt-1.5 text-[0.8rem] leading-normal text-accent-red">{error}</p>}

      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-border-soft pt-[22px]">
        <div
          className={`flex items-center gap-2 text-[0.85rem] text-accent-gold transition-opacity duration-200 [&>svg]:h-3.5 [&>svg]:w-3.5 ${
            dirty ? "opacity-100" : "opacity-0"
          }`}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          Unsaved changes
        </div>
        <Button onClick={handleSave} disabled={saving || !canSave}>
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
