"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { UserIdentity } from "@supabase/supabase-js";
import { ApiError, getErrorMessage } from "@/lib/api/client";
import { createClient } from "@/lib/supabase/client";
import { updateDisplayName, updateCountry, updateShowCountryOnLeaderboard } from "@/lib/client-data/userProfile";
import { useToast } from "@/app/components/ui/Toast";
import { Button } from "@/app/components/ui/Button";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { CountrySelect } from "@/app/components/ui/CountrySelect";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { Toggle } from "@/app/components/ui/Toggle";
import { AvatarEditor } from "@/app/components/ui/AvatarEditor";
import { fieldLabel, fieldHint } from "@/app/components/ui/formClasses";
import { MAX_DISPLAY_NAME_LENGTH, type UserProfile } from "@/lib/types";
import { ProBadge } from "@/app/components/ui/ProBadge";
import { scrollIntoViewOnFocus } from "@/lib/scrollFocus";
import { FaCheck } from "react-icons/fa6";
import { FcGoogle } from "react-icons/fc";

// Keys are short codes we or GoTrue produce; anything else (e.g. a message
// already relayed verbatim from the switch-google-account Edge Function) is
// shown as-is, since it's already a human-readable sentence.
const SWITCH_ERROR_MESSAGES: Record<string, string> = {
  no_new_account: "Couldn't detect a new Google account. Please try again.",
  access_denied: "You didn't approve the Google sign-in.",
  identity_already_exists: "That Google account is already used by another profile.",
  identity_already_own_account: "You're already signed in with that Google account.",
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
    // Not a failure — the user just re-picked the account they were already on — so
    // show it with the success styling instead of the red error toast.
    if (switchError === "identity_already_own_account") showToast(switchErrorMessage(switchError));
    else if (switchError) showToast(switchErrorMessage(switchError), "error");
    router.replace("/settings/profile");
  }, [searchParams, router, showToast]);

  return null;
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
  const [showCountryOnLeaderboard, setShowCountryOnLeaderboard] = useState(initial.show_country_on_leaderboard);
  const [avatarUrl, setAvatarUrl] = useState(initial.avatar_url ?? "");

  // `initial` can still be loading (or get refetched) after this component has
  // already mounted with a stale/empty value — resync instead of trusting the
  // one-time useState initializer, and give a fresh URL a chance to load again.
  useEffect(() => {
    setAvatarUrl(initial.avatar_url ?? "");
  }, [initial.avatar_url]);

  const [identities, setIdentities] = useState<UserIdentity[]>([]);
  const [identitiesStatus, setIdentitiesStatus] = useState<"loading" | "loaded">("loading");
  const [switching, setSwitching] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();
    supabase.auth.getUserIdentities().then(({ data }) => {
      if (!cancelled) {
        setIdentities((data?.identities ?? []).filter((i) => i.provider === "google"));
        setIdentitiesStatus("loaded");
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

  async function handleShowCountryOnLeaderboardChange() {
    const next = !showCountryOnLeaderboard;
    setShowCountryOnLeaderboard(next);
    try {
      await updateShowCountryOnLeaderboard(userId, next);
      onSaved();
    } catch (err) {
      showToast(err instanceof ApiError ? err.message : "Could not save your preference.", "error");
      setShowCountryOnLeaderboard(!next);
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
      showToast(getErrorMessage(err, "Could not start switching your Google account."), "error");
      setSwitching(false);
    }
  }

  async function handleUnlinkIdentity(identity: UserIdentity) {
    setUnlinkingId(identity.identity_id);
    const previousIdentities = identities;
    setIdentities((prev) => prev.filter((i) => i.identity_id !== identity.identity_id));
    try {
      const supabase = createClient();
      const { error: unlinkError } = await supabase.auth.unlinkIdentity(identity);
      if (unlinkError) throw unlinkError;
      showToast("Google account unlinked");
    } catch (err) {
      setIdentities(previousIdentities);
      showToast(getErrorMessage(err, "Could not unlink that Google account."), "error");
    } finally {
      setUnlinkingId(null);
    }
  }

  const fieldInput =
    "w-full rounded-lg border border-border-soft bg-white/[0.03] px-3.5 py-3 text-[0.95rem] text-white outline-none transition-colors focus:border-accent-blue/40 read-only:cursor-not-allowed read-only:text-text-muted";

  return (
    <div>
      <GlassCard padding="lg" className="mb-5.5">
        <div className="mb-6.5 flex flex-col items-center gap-4 md:flex-row md:gap-5">
          <AvatarEditor
            userId={userId}
            avatarUrl={avatarUrl}
            onAvatarChange={(url) => setAvatarUrl(url ?? "")}
            onSaved={onSaved}
            size="lg"
            badge={initial.is_premium ? <ProBadge size="lg" className="-top-2.5 -right-2.5" /> : null}
          />
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
          <CountrySelect id="profile-country" value={country} onChange={handleCountryChange} placement="auto" />
          <div className="mt-3 flex items-center justify-between gap-4 rounded-lg border border-border-soft bg-white/[0.02] px-3.5 py-3">
            <div>
              <div className="text-sm font-bold">Show country on leaderboard</div>
              <div className="mt-0.5 text-[0.8rem] text-text-muted">
                Display your flag next to your name on leaderboards.
              </div>
            </div>
            <Toggle checked={showCountryOnLeaderboard} onChange={handleShowCountryOnLeaderboardChange} />
          </div>
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
          {identitiesStatus === "loading" ? (
            <div className="mt-2.5">
              <Skeleton className="h-[46px] w-full rounded-lg" />
            </div>
          ) : identities.length > 1 ? (
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
          ) : null}
        </div>
      </GlassCard>

      <Suspense fallback={null}>
        <SwitchResultNotice />
      </Suspense>
    </div>
  );
}
