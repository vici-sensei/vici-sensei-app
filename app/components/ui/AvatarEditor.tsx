"use client";

import { useEffect, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { FaPenToSquare, FaTrash, FaUser } from "react-icons/fa6";
import { useToast } from "@/app/components/ui/Toast";
import { ApiError } from "@/lib/api/client";
import { uploadAvatar, removeAvatar } from "@/lib/client-data/userProfile";
import { avatarSrc } from "@/lib/avatar";

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

const SIZE = {
  sm: {
    bubble: "h-32 w-32",
    placeholder: "text-[2.2rem]",
    button: "h-9 w-9",
    icon: "h-3.5 w-3.5",
    left: "-bottom-2 -left-2",
    right: "-bottom-2 -right-2",
  },
  lg: {
    bubble: "h-40 w-40",
    placeholder: "text-[2.75rem]",
    button: "h-10 w-10",
    icon: "h-4 w-4",
    left: "-bottom-2.5 -left-2.5",
    right: "-bottom-2.5 -right-2.5",
  },
};

interface AvatarEditorProps {
  userId: string;
  avatarUrl: string | null;
  onAvatarChange: (url: string | null) => void;
  onSaved?: () => void;
  onSavingChange?: (saving: boolean) => void;
  size: "sm" | "lg";
  badge?: ReactNode;
}

/** Self-contained avatar bubble + change/remove buttons + crop/confirm flow, shared between
 * onboarding's StepProfile and the profile settings form. */
export function AvatarEditor({
  userId,
  avatarUrl,
  onAvatarChange,
  onSaved,
  onSavingChange,
  size,
  badge,
}: AvatarEditorProps) {
  const { showToast } = useToast();
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [removingAvatar, setRemovingAvatar] = useState(false);
  const [confirmingRemoveAvatar, setConfirmingRemoveAvatar] = useState(false);
  const [cropFile, setCropFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const s = SIZE[size];

  // Lets a parent (onboarding's Step 4) block navigation while a photo upload/removal is in
  // flight, the same way it already does for the debounced name save.
  useEffect(() => {
    onSavingChange?.(uploadingAvatar || removingAvatar);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- onSavingChange closes over stable state each render
  }, [uploadingAvatar, removingAvatar]);

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
      onSaved?.();
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
      onSaved?.();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not remove your photo.", "error");
      onAvatarChange(previousAvatarUrl);
    } finally {
      setRemovingAvatar(false);
    }
  }

  return (
    <div className={`relative ${s.bubble} shrink-0`}>
      <div
        className={`flex h-full w-full items-center justify-center overflow-hidden rounded-2xl border border-white/15 bg-gradient-to-br from-accent-blue/35 to-accent-red/35 font-extrabold text-white ${s.placeholder}`}
      >
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
      {badge}
      {avatarUrl && !avatarFailed ? (
        <button
          type="button"
          onClick={() => setConfirmingRemoveAvatar(true)}
          disabled={removingAvatar || uploadingAvatar}
          aria-label="Remove profile photo"
          className={`absolute ${s.left} ${s.button} flex items-center justify-center rounded-full border border-border-soft bg-bg-cards text-text-muted shadow-[0_4px_10px_rgba(0,0,0,0.4)] transition-colors hover:text-accent-red disabled:cursor-not-allowed disabled:opacity-60`}
        >
          {removingAvatar ? (
            <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
          ) : (
            <FaTrash className={s.icon} />
          )}
        </button>
      ) : null}
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploadingAvatar}
        aria-label="Change profile photo"
        className={`absolute ${s.right} ${s.button} flex items-center justify-center rounded-full border border-border-soft bg-bg-cards text-text-muted shadow-[0_4px_10px_rgba(0,0,0,0.4)] transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-60`}
      >
        {uploadingAvatar ? (
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        ) : (
          <FaPenToSquare className={s.icon} />
        )}
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="hidden"
        onChange={handleFileSelected}
      />

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
    </div>
  );
}
