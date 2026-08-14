"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { UserIdentity } from "@supabase/supabase-js";
import { ApiError } from "@/lib/api/client";
import { createClient } from "@/lib/supabase/client";
import { updateDisplayName, updateCountry, uploadAvatar } from "@/lib/client-data/userProfile";
import { useToast } from "@/app/components/ui/Toast";
import { Button } from "@/app/components/ui/Button";
import { CountrySelect } from "@/app/components/ui/CountrySelect";
import { AvatarCropModal } from "./AvatarCropModal";
import { MAX_DISPLAY_NAME_LENGTH, type UserProfile } from "@/lib/types";
import { avatarSrc } from "@/lib/avatar";
import { scrollIntoViewOnFocus } from "@/lib/scrollFocus";
import { FaCheck, FaPenToSquare } from "react-icons/fa6";
import { FcGoogle } from "react-icons/fc";

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
// Target side length for uploaded avatars: comfortably sharp at the size we display
// them (including retina), without shipping multi-megabyte originals to storage.
const AVATAR_TARGET_SIZE = 640;

// Keys are short codes we or GoTrue produce; anything else (e.g. a message
// already relayed verbatim from the switch-google-account Edge Function) is
// shown as-is, since it's already a human-readable sentence.
const SWITCH_ERROR_MESSAGES: Record<string, string> = {
  no_new_account: "Couldn't detect a new Google account. Please try again.",
  access_denied: "You didn't approve the Google sign-in.",
  identity_already_exists: "That Google account is already used by another profile.",
};

function switchErrorMessage(code: string): string {
  return SWITCH_ERROR_MESSAGES[code] ?? code;
}

/** Reads ?switched=/?switchError= left by the auth callback and strips them once shown. */
function SwitchResultNotice() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { showToast } = useToast();

  useEffect(() => {
    const switched = searchParams.get("switched");
    const switchError = searchParams.get("switchError");
    if (!switched && !switchError) return;

    if (switched) showToast("Now signed in with your new Google account");
    if (switchError) showToast(switchErrorMessage(switchError), "error");
    router.replace("/settings/profile");
  }, [searchParams, router, showToast]);

  return null;
}

function initials(name: string | null, email: string) {
  const source = name?.trim() || email;
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return source.slice(0, 2).toUpperCase();
}

export function ProfileSettingsForm({
  initial,
  userId,
  onSaved,
}: {
  initial: UserProfile;
  userId: string;
  onSaved: () => void;
}) {
  const { showToast } = useToast();
  const [displayName, setDisplayName] = useState(initial.display_name ?? "");
  const [savedName, setSavedName] = useState(initial.display_name ?? "");
  const [nameStatus, setNameStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [country, setCountry] = useState<string | null>(initial.country);
  const [savedCountry, setSavedCountry] = useState<string | null>(initial.country);
  const [countryStatus, setCountryStatus] = useState<"idle" | "saving" | "saved">("idle");
  const [avatarUrl, setAvatarUrl] = useState(initial.avatar_url ?? "");
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [identities, setIdentities] = useState<UserIdentity[]>([]);
  const [switching, setSwitching] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getUserIdentities().then(({ data }) => {
      if (!cancelled) {
        setIdentities((data?.identities ?? []).filter((i) => i.provider === "google"));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function saveDisplayName(trimmed: string) {
    if (trimmed === savedName || nameStatus === "saving") return;

    if (trimmed.length === 0 || trimmed.length > MAX_DISPLAY_NAME_LENGTH) {
      showToast(`Name must be 1–${MAX_DISPLAY_NAME_LENGTH} characters.`, "error");
      setDisplayName(savedName);
      return;
    }

    setNameStatus("saving");
    try {
      await updateDisplayName(userId, trimmed);
      setSavedName(trimmed);
      setNameStatus("saved");
      onSaved();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not save your name.", "error");
      setDisplayName(savedName);
      setNameStatus("idle");
    }
  }

  // Autosave a beat after the user stops typing. Invalid/empty values are left
  // alone here (no toast mid-edit) — handleNameBlur below is what validates and
  // reverts once the user actually leaves the field.
  useEffect(() => {
    const trimmed = displayName.trim();
    if (trimmed === savedName || trimmed.length === 0 || trimmed.length > MAX_DISPLAY_NAME_LENGTH) return;

    const timeout = setTimeout(() => saveDisplayName(trimmed), 800);
    return () => clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- saveDisplayName closes over stable state/props each render
  }, [displayName, savedName]);

  async function handleNameBlur() {
    await saveDisplayName(displayName.trim());
  }

  async function handleCountryChange(code: string) {
    if (code === savedCountry || countryStatus === "saving") return;
    setCountry(code);
    setCountryStatus("saving");
    try {
      await updateCountry(userId, code);
      setSavedCountry(code);
      setCountryStatus("saved");
      onSaved();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not save your country.", "error");
      setCountry(savedCountry);
      setCountryStatus("idle");
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
      const updated = await uploadAvatar(userId, cropped);
      setAvatarUrl(updated.avatar_url ?? "");
      setAvatarFailed(false);
      showToast("Photo updated");
      onSaved();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not upload your photo.", "error");
    } finally {
      setUploadingAvatar(false);
    }
  }

  async function handleSwitchGoogleAccount() {
    setSwitching(true);
    try {
      const supabase = createClient();
      const { error: linkError } = await supabase.auth.linkIdentity({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/settings/profile&switch=1`,
          queryParams: {
            access_type: "offline",
            prompt: "select_account",
            hd: "gmail.com",
          },
        },
      });
      if (linkError) throw linkError;
      // On success the browser navigates away to Google — no further state change needed.
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not start switching your Google account.", "error");
      setSwitching(false);
    }
  }

  async function handleUnlinkIdentity(identity: UserIdentity) {
    setUnlinkingId(identity.identity_id);
    try {
      const supabase = createClient();
      const { error: unlinkError } = await supabase.auth.unlinkIdentity(identity);
      if (unlinkError) throw unlinkError;
      setIdentities((prev) => prev.filter((i) => i.identity_id !== identity.identity_id));
      showToast("Google account unlinked");
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Could not unlink that Google account.", "error");
    } finally {
      setUnlinkingId(null);
    }
  }

  const previewInitials = initials(displayName, initial.email);

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
            <div className="relative">
              <span className="pointer-events-none absolute right-3.5 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center">
                {nameStatus === "saving" && (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/25 border-t-white" />
                )}
                {nameStatus === "saved" && <FaCheck className="h-3.5 w-3.5 text-accent-green" />}
              </span>
              <input
                className={`${fieldInput} pr-10`}
                type="text"
                maxLength={MAX_DISPLAY_NAME_LENGTH}
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value);
                  if (nameStatus === "saved") setNameStatus("idle");
                }}
                onFocus={scrollIntoViewOnFocus}
                onBlur={handleNameBlur}
                onKeyDown={(e) => {
                  if (e.key === "Enter") e.currentTarget.blur();
                }}
              />
            </div>
            <div className={fieldHint}>1–{MAX_DISPLAY_NAME_LENGTH} characters</div>
          </div>
        </div>
        <div className="mb-6.5">
          <div className="mb-2 flex items-center gap-2">
            <label htmlFor="profile-country" className="text-sm font-bold uppercase tracking-[0.6px] text-text-muted">
              Country
            </label>
            {countryStatus === "saving" && (
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-white/25 border-t-white" />
            )}
            {countryStatus === "saved" && <FaCheck className="h-3 w-3 text-accent-green" />}
          </div>
          <CountrySelect id="profile-country" value={country} onChange={handleCountryChange} />
        </div>
        <div>
          <label className={fieldLabel}>Linked to Google</label>
          <div className="flex flex-wrap items-center justify-between gap-2.5">
            <span className="flex items-center gap-2 py-3 text-[0.95rem] text-white">
              <FcGoogle className="h-4 w-4 shrink-0 rounded-full bg-white p-0.5" />
              {initial.email}
            </span>
            <Button type="button" variant="secondary" size="sm" loading={switching} onClick={handleSwitchGoogleAccount}>
              Switch Google account
            </Button>
          </div>
          {identities.length > 1 && (
            <div className="mt-2.5 flex flex-col gap-2">
              {identities.map((identity) => (
                <div
                  key={identity.identity_id}
                  className="flex flex-wrap items-center gap-2.5 rounded-lg border border-border-soft bg-white/[0.03] px-3.5 py-2.5"
                >
                  <FcGoogle className="h-4 w-4 shrink-0 rounded-full bg-white p-0.5" />
                  <span className="flex-1 text-[0.85rem] text-white">
                    {identity.identity_data?.email ?? "Unknown Google account"}
                  </span>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    danger
                    loading={unlinkingId === identity.identity_id}
                    onClick={() => handleUnlinkIdentity(identity)}
                  >
                    Unlink
                  </Button>
                </div>
              ))}
            </div>
          )}
          <div className={fieldHint}>
            Synced from your Google account — switching won&apos;t change your name, photo, or progress.
          </div>
        </div>
      </div>

      <Suspense fallback={null}>
        <SwitchResultNotice />
      </Suspense>

      {cropFile && (
        <AvatarCropModal
          file={cropFile}
          outputSize={AVATAR_TARGET_SIZE}
          onCancel={() => setCropFile(null)}
          onCropped={handleAvatarCropped}
        />
      )}
    </div>
  );
}
