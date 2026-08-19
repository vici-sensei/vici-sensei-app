"use client";

import { useRef, useState, type ChangeEvent } from "react";
import dynamic from "next/dynamic";
import { FaCheck, FaPenToSquare, FaTrash, FaUser } from "react-icons/fa6";
import { useToast } from "@/app/components/ui/Toast";
import { ApiError } from "@/lib/api/client";
import { uploadAvatar, removeAvatar } from "@/lib/client-data/userProfile";
import { avatarSrc } from "@/lib/avatar";
import { MAX_DISPLAY_NAME_LENGTH } from "@/lib/types";

// Both are only ever rendered after a user action (cropping a new photo, confirming a
// removal) -- loaded on demand instead of bundled into every visit to onboarding.
const AvatarCropModal = dynamic(
  () => import("@/app/(settings)/settings/profile/AvatarCropModal").then((m) => m.AvatarCropModal),
  { ssr: false }
);
const ConfirmDialog = dynamic(() => import("@/app/components/ui/ConfirmDialog").then((m) => m.ConfirmDialog), {
  ssr: false,
});

const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
// Target side length for uploaded avatars: comfortably sharp at the size we display
// them (including retina), without shipping multi-megabyte originals to storage.
const AVATAR_TARGET_SIZE = 640;

export function StepProfile({
  userId,
  avatarUrl,
  onAvatarChange,
  displayName,
  onDisplayNameChange,
  nameStatus,
}: {
  userId: string;
  avatarUrl: string | null;
  onAvatarChange: (url: string | null) => void;
  displayName: string;
  onDisplayNameChange: (name: string) => void;
  nameStatus: "idle" | "saving" | "saved";
}) {
  const { showToast } = useToast();
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [removingAvatar, setRemovingAvatar] = useState(false);
  const [confirmingRemoveAvatar, setConfirmingRemoveAvatar] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function handleFileSelected(e: ChangeEvent<HTMLInputElement>) {
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

    const previousAvatarUrl = avatarUrl;
    const objectUrl = URL.createObjectURL(cropped);
    onAvatarChange(objectUrl);
    setAvatarFailed(false);

    setUploadingAvatar(true);
    try {
      const updated = await uploadAvatar(userId, cropped);
      onAvatarChange(updated.avatar_url);
      showToast("Photo updated");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not upload your photo.", "error");
      onAvatarChange(previousAvatarUrl);
    } finally {
      URL.revokeObjectURL(objectUrl);
      setUploadingAvatar(false);
    }
  }

  async function handleRemoveAvatar() {
    const previousAvatarUrl = avatarUrl;
    setConfirmingRemoveAvatar(false);
    setRemovingAvatar(true);
    try {
      const updated = await removeAvatar(userId);
      onAvatarChange(updated.avatar_url);
      setAvatarFailed(false);
      showToast("Photo removed");
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not remove your photo.", "error");
      onAvatarChange(previousAvatarUrl);
    } finally {
      setRemovingAvatar(false);
    }
  }

  return (
    <>
      <h1 className="mb-2 text-[1.5rem] font-extrabold tracking-[-0.5px]">Set up your profile</h1>
      <p className="mx-auto mb-6 max-w-md text-sm leading-[1.6] text-text-muted">
        This is how you&apos;ll appear to other students.
      </p>

      <div className="flex flex-col items-center gap-5">
        <div className="relative h-32 w-32 shrink-0">
          <div className="flex h-full w-full items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-accent-blue/35 to-accent-red/35 text-[2.2rem] font-extrabold text-white">
            {avatarUrl && !avatarFailed ? (
              // eslint-disable-next-line @next/next/no-img-element -- arbitrary user-supplied URL, any domain
              <img
                src={avatarSrc(avatarUrl, 512)}
                alt=""
                className="h-full w-full object-cover"
                onError={() => setAvatarFailed(true)}
              />
            ) : (
              <FaUser className="h-[45%] w-[45%]" />
            )}
          </div>
          {avatarUrl && !avatarFailed ? (
            <button
              type="button"
              onClick={() => setConfirmingRemoveAvatar(true)}
              disabled={removingAvatar || uploadingAvatar}
              aria-label="Remove profile photo"
              className="absolute -bottom-2 -left-2 flex h-9 w-9 items-center justify-center rounded-full border border-border-soft bg-bg-cards text-text-muted shadow-[0_4px_10px_rgba(0,0,0,0.4)] transition-colors hover:text-accent-red disabled:cursor-not-allowed disabled:opacity-60"
            >
              {removingAvatar ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
              ) : (
                <FaTrash className="h-3.5 w-3.5" />
              )}
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadingAvatar}
            aria-label="Change profile photo"
            className="absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-full border border-border-soft bg-bg-cards text-text-muted shadow-[0_4px_10px_rgba(0,0,0,0.4)] transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-60"
          >
            {uploadingAvatar ? (
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
            ) : (
              <FaPenToSquare className="h-3.5 w-3.5" />
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={handleFileSelected}
          />
        </div>

        <div className="w-full max-w-xs text-left">
          <label
            htmlFor="onboarding-name"
            className="mb-2 block text-sm font-bold uppercase tracking-[0.6px] text-text-muted"
          >
            Name
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute right-3.5 top-1/2 flex h-4 w-4 -translate-y-1/2 items-center justify-center">
              {nameStatus === "saving" && (
                <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white/25 border-t-white" />
              )}
              {nameStatus === "saved" && <FaCheck className="h-3.5 w-3.5 text-accent-green" />}
            </span>
            <input
              id="onboarding-name"
              className="w-full rounded-lg border border-border-soft bg-white/[0.03] px-3.5 py-3 pr-10 text-[0.95rem] text-white outline-none transition-colors focus:border-accent-blue/40"
              type="text"
              maxLength={MAX_DISPLAY_NAME_LENGTH}
              value={displayName}
              onChange={(e) => onDisplayNameChange(e.target.value)}
            />
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

      {confirmingRemoveAvatar && (
        <ConfirmDialog
          title="Remove profile photo?"
          confirmLabel="Remove"
          danger
          loading={removingAvatar}
          onConfirm={handleRemoveAvatar}
          onCancel={() => setConfirmingRemoveAvatar(false)}
        />
      )}
    </>
  );
}
