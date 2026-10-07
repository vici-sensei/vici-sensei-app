"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { UserIdentity } from "@supabase/supabase-js";
import { ApiError, getErrorMessage } from "@/lib/api/client";
import { createClient } from "@/lib/supabase/client";
import { updateDisplayName, updateCountry, updateShowCountryOnLeaderboard } from "@/lib/client-data/userProfile";
import { hasPassword as fetchHasPassword } from "@/lib/client-data/account";
import { isPasswordAuthEnabled } from "@/lib/auth/passwordAuth";
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
import { ProTimeLeft } from "@/app/components/ui/ProTimeLeft";
import { scrollIntoViewOnFocus } from "@/lib/scrollFocus";
import { useOnPageRestored } from "@/lib/useOnPageRestored";
import { FaCheck } from "react-icons/fa6";
import { FcGoogle } from "react-icons/fc";
import { SignInMethods } from "./SignInMethods";

// Keys are short codes we or GoTrue produce; anything else (e.g. a message
// already relayed verbatim from the switch-google-account Edge Function) is
// shown as-is, since it's already a human-readable sentence.
const SWITCH_ERROR_MESSAGES: Record<string, string> = {
  no_new_account: "Couldn't detect a new Google account. Please try again.",
  access_denied: "You didn't approve the Google sign-in.",
  identity_already_exists: "That Google account is already used by another profile.",
  identity_already_own_account: "You're already signed in with that Google account.",
  // GoTrue's generic bucket for "a database trigger rejected this" -- here, the Gmail-only rule
  // on Google identities (supabase/migrations/*_password_auth_relax_gmail_rule.sql).
  server_error: "Couldn't link that Google account. Only @gmail.com accounts are supported.",
};

function switchErrorMessage(code: string): string {
  return SWITCH_ERROR_MESSAGES[code] ?? code;
}

/** Reads ?switched=/?linked=/?emailChanged=/?switchError= left by the auth callback (or the
 * email-change confirmation page) and strips them once shown. */
function SwitchResultNotice() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { showToast } = useToast();

  useEffect(() => {
    const switched = searchParams.get("switched");
    const linked = searchParams.get("linked");
    const emailChanged = searchParams.get("emailChanged");
    const switchError = searchParams.get("switchError");
    if (!switched && !linked && !emailChanged && !switchError) return;

    if (switched) showToast("Now signed in with your new Google account");
    if (linked) showToast("Google account linked");
    if (emailChanged) showToast("Your email address was updated");
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
  loading = false,
  onSaved,
}: {
  initial: UserProfile;
  userId: string;
  /** True while `initial` is still the layout's placeholder, not the real row -- name, country
   *  and the linked Google email show skeleton placeholders instead of the placeholder's (wrong)
   *  values, and controls that would act on it are locked. */
  loading?: boolean;
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
    function sync() {
      setAvatarUrl(initial.avatar_url ?? "");
    }
    sync();
  }, [initial.avatar_url]);

  const [identities, setIdentities] = useState<UserIdentity[]>([]);
  const [identitiesStatus, setIdentitiesStatus] = useState<"loading" | "loaded">("loading");
  const [switching, setSwitching] = useState(false);
  const [unlinkingId, setUnlinkingId] = useState<string | null>(null);

  // Email + password (behind NEXT_PUBLIC_PASSWORD_AUTH). `null` = still loading / unknown.
  const passwordAuth = isPasswordAuthEnabled();
  const [passwordSet, setPasswordSet] = useState<boolean | null>(null);
  const [linking, setLinking] = useState(false);

  // Back from Google's account chooser restores the page from bfcache with these still spinning.
  useOnPageRestored(() => {
    setSwitching(false);
    setLinking(false);
  });

  useEffect(() => {
    if (!passwordAuth) return;
    let cancelled = false;
    fetchHasPassword().then((value) => {
      if (!cancelled) setPasswordSet(value);
    });
    return () => {
      cancelled = true;
    };
  }, [passwordAuth]);

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

  /** For an account that has no Google identity yet (it signed up with a password). The callback
   * only has to bounce back to Settings -- no account switch is involved, unlike the flow above. */
  async function handleLinkGoogleAccount() {
    setLinking(true);
    try {
      const supabase = createClient();
      const { error: linkError } = await supabase.auth.linkIdentity({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback?next=/settings/profile&link=1`,
          queryParams: { access_type: "offline", prompt: "select_account", hd: "gmail.com" },
        },
      });
      if (linkError) throw linkError;
      // On success the browser navigates away to Google — no further state change needed.
    } catch (err) {
      showToast(getErrorMessage(err, "Could not start linking your Google account."), "error");
      setLinking(false);
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

  // `read-only:` targets an actually-readOnly <input> -- CSS :read-only otherwise matches any
  // non-editable element by default, so applying the full class (with that variant) straight to
  // the skeleton placeholder <div> below would spuriously trigger it, showing the browser's
  // native "not-allowed" cursor on hover even though nothing is actually disabled there.
  const fieldInputBase =
    "w-full rounded-lg border border-border-soft bg-white/[0.03] px-3.5 py-3 text-[0.95rem] text-white outline-none transition-colors focus:border-accent-blue/40";
  const fieldInput = `${fieldInputBase} read-only:cursor-not-allowed read-only:text-text-muted`;
  // Only a password account can lack a Google identity (a Google account always has one).
  const noGoogleLinked = passwordAuth && identitiesStatus === "loaded" && identities.length === 0;
  // A password account with Google linked lists that identity (with its Unlink button) below, so the
  // summary row above would only repeat the same address -- and it has no action of its own there
  // ("Switch" is hidden for password accounts).
  const googleListedBelow = passwordAuth && passwordSet === true && identities.length > 0;

  return (
    <div>
      <GlassCard padding="lg" className="mb-5.5">
        <div className="mb-6.5 flex flex-col items-center gap-4 md:flex-row md:gap-5">
          <div className="flex flex-col items-center gap-2.5">
            <AvatarEditor
              userId={userId}
              avatarUrl={avatarUrl}
              onAvatarChange={(url) => setAvatarUrl(url ?? "")}
              onSaved={onSaved}
              size="lg"
              badge={initial.is_premium ? <ProBadge size="lg" className="-top-2.5 -right-2.5" /> : null}
              loading={loading}
            />
            <ProTimeLeft user={initial} href="/settings/billing" />
          </div>
          <div className="w-full md:flex-1">
            <label className={fieldLabel}>Full name</label>
            <div className="relative">
              {loading ? (
                <div className={`${fieldInputBase} pr-10`}>
                  <span className="block h-3.5 w-full animate-pulse rounded-md bg-white/10" />
                </div>
              ) : (
                <>
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
                </>
              )}
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
          <CountrySelect
            id="profile-country"
            value={country}
            onChange={handleCountryChange}
            placement="auto"
            loading={loading}
          />
          <div className="mt-3 flex items-center justify-between gap-4 rounded-lg border border-border-soft bg-white/[0.02] px-3.5 py-3">
            <div>
              <div className="text-sm font-bold">Show country on leaderboard</div>
              <div className="mt-0.5 text-[0.8rem] text-text-muted">
                Display your flag next to your name on leaderboards.
              </div>
            </div>
            <Toggle checked={showCountryOnLeaderboard} onChange={handleShowCountryOnLeaderboardChange} disabled={loading} />
          </div>
        </div>
        <div className={passwordAuth ? "mb-6.5" : undefined}>
          <label className={fieldLabel}>{passwordAuth ? "Google" : "Linked to Google"}</label>
          {noGoogleLinked ? (
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <span className="py-3 text-[0.95rem] text-text-muted">No Google account linked</span>
              <Button type="button" variant="secondary" size="sm" loading={linking} onClick={handleLinkGoogleAccount}>
                Link Google account
              </Button>
            </div>
          ) : googleListedBelow ? null : (
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <span className="flex items-center gap-2 py-3 text-[0.95rem] text-white">
                <FcGoogle className="h-4 w-4 shrink-0 rounded-full bg-white p-0.5" />
                {loading ? (
                  <span className="inline-block h-3.5 w-40 max-w-full animate-pulse rounded-md bg-white/10" />
                ) : (
                  (passwordAuth && identities[0]?.identity_data?.email) || initial.email
                )}
              </span>
              {/* "Switch" rewrites the account's email to the new Google one, which is only right for
                  an account that signs in with Google alone -- a password account changes its email
                  from the section below instead. */}
              {!(passwordAuth && passwordSet !== false) && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  loading={switching}
                  disabled={loading}
                  onClick={handleSwitchGoogleAccount}
                >
                  Switch Google account
                </Button>
              )}
            </div>
          )}
          {identitiesStatus === "loading" ? (
            <div className="mt-2.5">
              <Skeleton className="h-[46px] w-full rounded-lg" />
            </div>
          ) : identities.length > 1 || googleListedBelow ? (
            <div className={`${googleListedBelow ? "" : "mt-2.5"} flex flex-col gap-2`}>
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
        {passwordAuth && (
          <SignInMethods
            email={initial.email}
            hasPassword={passwordSet}
            onPasswordSet={() => setPasswordSet(true)}
            loading={loading}
          />
        )}
      </GlassCard>

      <Suspense fallback={null}>
        <SwitchResultNotice />
      </Suspense>
    </div>
  );
}
