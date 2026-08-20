"use client";

import { FaCheck } from "react-icons/fa6";
import { AvatarEditor } from "@/app/components/ui/AvatarEditor";
import { MAX_DISPLAY_NAME_LENGTH } from "@/lib/types";

export function StepProfile({
  userId,
  avatarUrl,
  onAvatarChange,
  onAvatarSavingChange,
  displayName,
  onDisplayNameChange,
  nameStatus,
}: {
  userId: string;
  avatarUrl: string | null;
  onAvatarChange: (url: string | null) => void;
  onAvatarSavingChange: (saving: boolean) => void;
  displayName: string;
  onDisplayNameChange: (name: string) => void;
  nameStatus: "idle" | "saving" | "saved";
}) {
  return (
    <>
      <h1 className="mb-2 text-[1.5rem] font-extrabold tracking-[-0.5px]">Set up your profile</h1>
      <p className="mx-auto mb-6 max-w-md text-sm leading-[1.6] text-text-muted">
        This is how you&apos;ll appear to other students.
      </p>

      <div className="flex flex-col items-center gap-5">
        <AvatarEditor
          userId={userId}
          avatarUrl={avatarUrl}
          onAvatarChange={onAvatarChange}
          onSavingChange={onAvatarSavingChange}
          size="sm"
        />

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
    </>
  );
}
