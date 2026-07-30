"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { apiPatch, apiUpload, ApiError } from "@/lib/api/client";
import { createClient } from "@/lib/supabase/client";
import { useToast } from "@/app/components/ui/Toast";
import { Button } from "@/app/components/ui/Button";
import { AvatarCropModal } from "./AvatarCropModal";
import type { UserProfile, UserProfilePatch } from "@/lib/types";
import { avatarSrc } from "@/lib/avatar";
import { FaCircleExclamation, FaClock, FaPenToSquare } from "react-icons/fa6";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
// Target side length for uploaded avatars: comfortably sharp at the size we display
// them (including retina), without shipping multi-megabyte originals to storage.
const AVATAR_TARGET_SIZE = 640;
const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
};
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

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
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [newEmail, setNewEmail] = useState(initial.email);
  const [emailSubmitting, setEmailSubmitting] = useState(false);
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!cancelled && data.user?.new_email) {
        setPendingEmail(data.user.new_email);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleSave() {
    setSaving(true);
    const body: UserProfilePatch = { display_name: displayName.trim() };
    try {
      await apiPatch<UserProfile>("/api/user/me", body);
      setDirty(false);
      showToast("Profile saved");
      router.refresh();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not save your profile.", "error");
    } finally {
      setSaving(false);
    }
  }

  function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showToast("Please choose an image file.", "error");
      return;
    }

    setCropFile(file);
  }

  async function handleAvatarCropped(cropped: Blob) {
    setCropFile(null);
    if (cropped.size > MAX_AVATAR_BYTES) {
      showToast("Image is too large. Please choose a smaller photo.", "error");
      return;
    }

    setUploadingAvatar(true);
    try {
      const ext = EXT_BY_MIME[cropped.type] ?? "jpg";
      const formData = new FormData();
      formData.append("file", cropped, `avatar.${ext}`);
      const updated = await apiUpload<UserProfile>("/api/user/me/avatar", formData);
      setAvatarUrl(updated.avatar_url ?? "");
      setAvatarFailed(false);
      showToast("Photo updated");
      router.refresh();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not upload your photo.", "error");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleEmailChange() {
    const trimmed = newEmail.trim();
    if (!EMAIL_PATTERN.test(trimmed)) {
      showToast("Please enter a valid email address.", "error");
      return;
    }
    if (trimmed === initial.email) {
      showToast("That's already your current email.", "error");
      return;
    }

    setEmailSubmitting(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser(
        { email: trimmed },
        { emailRedirectTo: `${window.location.origin}/auth/callback?next=/settings/profile` }
      );
      if (updateError) throw updateError;
      setPendingEmail(trimmed);
      setNewEmail(initial.email);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not start the email change.", "error");
    } finally {
      setEmailSubmitting(false);
    }
  }

  async function handleResendConfirmation() {
    if (!pendingEmail) return;
    setEmailSubmitting(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser(
        { email: pendingEmail },
        { emailRedirectTo: `${window.location.origin}/auth/callback?next=/settings/profile` }
      );
      if (updateError) throw updateError;
      showToast("Confirmation email resent");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not resend the confirmation email.", "error");
    } finally {
      setEmailSubmitting(false);
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
      <h2 className="mb-2 text-[1.7rem] font-extrabold leading-[1.2] tracking-[-0.8px]">Profile</h2>
      <p className="mb-6.5 text-base leading-[1.6] text-text-muted">Update how your name and avatar appear in the app.</p>

      <div className="mb-5.5 rounded-2xl border border-border-soft bg-bg-cards px-8 py-[30px] backdrop-blur-[10px]">
        <div className="mb-6.5 flex flex-col items-center gap-4 md:flex-row md:gap-5">
          <div className="relative h-40 w-40 shrink-0">
            <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-accent-blue/35 to-accent-red/35 text-[2.75rem] font-extrabold text-white">
              {avatarUrl && !avatarFailed ? (
                // eslint-disable-next-line @next/next/no-img-element -- arbitrary user-supplied URL, any domain
                <img
                  src={avatarSrc(avatarUrl, 512)}
                  alt=""
                  className="h-full w-full object-cover"
                  onError={() => setAvatarFailed(true)}
                />
              ) : (
                previewInitials
              )}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              aria-label="Change profile photo"
              className="absolute -bottom-2.5 -right-2.5 flex h-10 w-10 items-center justify-center rounded-full border border-border-soft bg-bg-cards text-text-muted shadow-[0_4px_10px_rgba(0,0,0,0.4)] transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {uploadingAvatar ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <FaPenToSquare className="h-4 w-4" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>
          <div className="w-full md:flex-1">
            <label className={fieldLabel}>Full name</label>
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
        </div>
        <div>
          <label className={fieldLabel}>Email</label>
          <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
            <input
              className={`${fieldInput} sm:flex-1`}
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
            />
            {newEmail.trim() !== initial.email && (
              <div className="flex gap-2.5">
                <Button type="button" size="sm" onClick={handleEmailChange} disabled={emailSubmitting}>
                  {emailSubmitting ? "Saving..." : "Save"}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => setNewEmail(initial.email)}
                  disabled={emailSubmitting}
                >
                  Cancel
                </Button>
              </div>
            )}
          </div>
          {pendingEmail && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2.5 rounded-lg border border-accent-gold/30 bg-accent-gold/10 px-3.5 py-2.5">
              <FaClock className="h-3.5 w-3.5 shrink-0 text-accent-gold" />
              <p className="flex-1 text-[0.8rem] leading-normal text-accent-gold">
                Not confirmed yet — check <strong>{pendingEmail}</strong> for the confirmation link.
              </p>
              <button
                type="button"
                onClick={handleResendConfirmation}
                disabled={emailSubmitting}
                className="text-[0.8rem] font-bold text-accent-gold underline underline-offset-2 transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                Resend
              </button>
            </div>
          )}
          <div className={fieldHint}>
            You still sign in with Google — changing this only updates your account email.
          </div>
        </div>
      </div>

      {cropFile && (
        <AvatarCropModal
          file={cropFile}
          outputSize={AVATAR_TARGET_SIZE}
          onCancel={() => setCropFile(null)}
          onCropped={handleAvatarCropped}
        />
      )}

      <div className="mt-7 flex flex-wrap items-center justify-between gap-3 border-t border-border-soft pt-[22px]">
        <div
          className={`flex items-center gap-2 text-[0.85rem] text-accent-gold transition-opacity duration-200 [&>svg]:h-3.5 [&>svg]:w-3.5 ${
            dirty ? "opacity-100" : "opacity-0"
          }`}
        >
          <FaCircleExclamation />
          Unsaved changes
        </div>
        <Button onClick={handleSave} disabled={saving || !canSave}>
          {saving ? "Saving..." : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
