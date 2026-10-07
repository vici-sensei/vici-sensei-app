import { createClient, createClientForRegion } from "@/lib/supabase/client";
import {
  getActiveRegion,
  isMultiRegionEnabled,
  isRegion,
  setActiveRegion,
  type Region,
} from "@/lib/supabase/regions";

/**
 * Email + password sign-in (docs/PASSWORD_AUTH_PLAN.md). Everything user-facing around it is gated
 * on this flag, same pattern as `isMultiRegionEnabled()`: the code ships first, the forms appear
 * only once the Dashboard side (SMTP, Email provider, templates, Turnstile) is configured on both
 * projects. Read as a literal `process.env.NEXT_PUBLIC_*` so Next inlines it.
 */
export function isPasswordAuthEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PASSWORD_AUTH === "true";
}

export const MIN_PASSWORD_LENGTH = 10;

/** Mirrors the Dashboard setting (minimum length 10, letters + digits) so the form can say what's
 * wrong before a round trip. The server stays the authority -- a `weak_password` response still maps
 * to the same message. */
export function passwordProblem(password: string): string | null {
  if (password.length < MIN_PASSWORD_LENGTH) return `Use at least ${MIN_PASSWORD_LENGTH} characters.`;
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return "Use both letters and digits.";
  return null;
}

/** What to say under an email field: as soon as the person starts typing an address that isn't
 * valid yet, or once they have left the field still invalid (e.g. empty). */
export function emailFieldError(email: string, touched: boolean): string | null {
  if (!touched && email.length === 0) return null;
  return looksLikeEmail(email) ? null : "Enter a valid email address.";
}

/** What to say under the password field of /signup and /login: the first problem as soon as the
 * person starts typing, or "Enter a password." once they have left the field empty (`touched`). */
export function passwordFieldError(password: string, touched: boolean): string | null {
  if (password.length === 0) return touched ? "Enter a password." : null;
  return passwordProblem(password);
}

const EMAIL_SHAPE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

export function looksLikeEmail(value: string): boolean {
  return EMAIL_SHAPE.test(value.trim());
}

/** Trimmed, lowercased -- what we send to Supabase so a stray capital or trailing space can't create
 * a second account (the Worker's `emailKey()` normalizes the same way). */
export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export const REGION_LABEL: Record<Region, string> = { eu: "Europe", us: "Americas" };

export type AuthFailureCode =
  | "invalid_credentials"
  | "email_not_confirmed"
  | "weak_password"
  | "same_password"
  | "rate_limited"
  | "captcha_failed"
  | "wrong_region"
  | "invalid_code"
  | "invalid_email"
  | "email_taken"
  | "signup_disabled"
  | "network"
  | "unknown";

export interface AuthFailure {
  code: AuthFailureCode;
  message: string;
  /** Set for `wrong_region`: where the account really lives. */
  region?: Region;
}

interface ErrorLike {
  message?: string;
  code?: string;
  status?: number;
  name?: string;
}

const GENERIC_FAILURE = "Something went wrong. Please try again.";

/** Shown when a new email address already belongs to another account -- whether GoTrue says so
 * (`email_exists`) or the Worker's region ledger does (`email_unavailable`). One wording for both,
 * so the answer doesn't reveal which region holds it. */
export const EMAIL_TAKEN_MESSAGE =
  "That email address is already linked to another Vici Sensei account. Please try a different one.";

/**
 * Turns a GoTrue error into a failure code the forms can branch on plus a user-facing message.
 * `error.code` is the stable machine-readable value (GoTrue's `ErrorCode`); the human `message` is
 * only consulted for the multi-region hook's `wrong_region:<region>` (the hook's message is copied
 * verbatim into the error, with no code of its own -- see app/auth/callback/page.tsx).
 */
export function describeAuthError(error: ErrorLike | null | undefined): AuthFailure {
  const message = error?.message ?? "";
  const wrongRegion = message.match(/wrong_region:(eu|us)/);
  if (wrongRegion && isRegion(wrongRegion[1])) {
    return {
      code: "wrong_region",
      region: wrongRegion[1],
      message: `This email already has an account in the ${REGION_LABEL[wrongRegion[1]]} region. Log in to continue.`,
    };
  }
  switch (error?.code) {
    case "invalid_credentials":
      return {
        code: "invalid_credentials",
        message: "Invalid email or password. If you signed up with Google, use “Continue with Google”.",
      };
    case "email_not_confirmed":
      return {
        code: "email_not_confirmed",
        message: "Please confirm your email first. We sent you a code when you signed up.",
      };
    case "weak_password":
      return { code: "weak_password", message: "That password is too weak. Use 10+ characters with letters and digits." };
    case "same_password":
      return { code: "same_password", message: "Your new password must be different from the current one." };
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
    case "over_sms_send_rate_limit":
      return { code: "rate_limited", message: "Too many attempts. Please wait a few minutes and try again." };
    case "captcha_failed":
      return { code: "captcha_failed", message: "We couldn't verify you're human. Please try again." };
    case "otp_expired":
    case "otp_disabled":
      return { code: "invalid_code", message: "That code is wrong or has expired. Request a new one." };
    case "email_address_invalid":
    case "validation_failed":
      return { code: "invalid_email", message: "That email address doesn't look valid." };
    case "email_exists":
      return { code: "email_taken", message: EMAIL_TAKEN_MESSAGE };
    case "signup_disabled":
      return { code: "signup_disabled", message: "Signing up with email isn't available right now." };
    case "email_provider_disabled":
      // The Dashboard's Email provider is off (the state before launch): sign-in, sign-up and
      // reset all land here, so the wording must fit all three.
      return { code: "signup_disabled", message: "Email sign-in isn't available right now. Use Google instead." };
  }
  if (error?.status === 429) {
    return { code: "rate_limited", message: "Too many attempts. Please wait a few minutes and try again." };
  }
  if (error?.name === "AuthRetryableFetchError" || error?.status === 0) {
    return { code: "network", message: "Couldn't reach the server. Check your connection and try again." };
  }
  return { code: "unknown", message: GENERIC_FAILURE };
}

/** Resolves to a Turnstile token (or `undefined` when no site key is configured). Each token is
 * single-use, so every request to Supabase asks for a fresh one. */
export type CaptchaTokenProvider = () => Promise<string | undefined>;

async function captchaTokenOrFailure(
  getCaptchaToken: CaptchaTokenProvider
): Promise<{ token: string | undefined } | { failure: AuthFailure }> {
  try {
    return { token: await getCaptchaToken() };
  } catch {
    return { failure: describeAuthError({ code: "captcha_failed" }) };
  }
}

/** Where the confirmation / reset / change-email links in the emails land. The Dashboard templates
 * append `?token_hash=...&type=...&region=...` to `{{ .RedirectTo }}`. */
function confirmRedirect(): string {
  return `${window.location.origin}/auth/confirm`;
}

/** Active region first, then the other one -- or a single `undefined` entry when multi-region is off
 * (then `createClient()` is the only project there is). */
function regionOrder(): Array<Region | undefined> {
  if (!isMultiRegionEnabled()) return [undefined];
  const active = getActiveRegion();
  return [active, active === "eu" ? "us" : "eu"];
}

function clientFor(region: Region | undefined) {
  return region ? createClientForRegion(region) : createClient();
}

// ---------------------------------------------------------------------------------------------
// Pending confirmation (so the "enter your code" screen knows the email without it ever being put
// in a URL)
// ---------------------------------------------------------------------------------------------

export type PendingKind = "email" | "recovery" | "email_change";

export interface PendingAuth {
  email: string;
  kind: PendingKind;
}

const PENDING_KEY = "vici-pending-auth";

export function rememberPendingAuth(pending: PendingAuth): void {
  try {
    window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending));
  } catch {
    // Private mode / storage disabled -- the code screen just asks for the email again.
  }
}

export function readPendingAuth(): PendingAuth | null {
  try {
    const raw = window.sessionStorage.getItem(PENDING_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PendingAuth>;
    if (typeof parsed.email !== "string" || (parsed.kind !== "email" && parsed.kind !== "recovery" && parsed.kind !== "email_change")) return null;
    return { email: parsed.email, kind: parsed.kind };
  } catch {
    return null;
  }
}

export function clearPendingAuth(): void {
  try {
    window.sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // Nothing to clean up.
  }
}

// ---------------------------------------------------------------------------------------------
// Sign up
// ---------------------------------------------------------------------------------------------

export type SignUpResult =
  | { ok: true; signedIn: boolean }
  | { ok: false; failure: AuthFailure };

/**
 * Creates the account on the ACTIVE region's project (the picker/geo guess decides it, same as
 * Google). Supabase answers identically whether or not the email already has an account, so the
 * caller must show the same "check your email" screen either way (anti-enumeration). A region
 * conflict (the email already belongs to the other region) is the one thing that does surface: the
 * "Before User Created" hook rejects it with `wrong_region:<region>`.
 */
export async function signUpWithPassword(
  email: string,
  password: string,
  getCaptchaToken: CaptchaTokenProvider
): Promise<SignUpResult> {
  const captcha = await captchaTokenOrFailure(getCaptchaToken);
  if ("failure" in captcha) return { ok: false, failure: captcha.failure };

  const normalized = normalizeEmail(email);
  const { data, error } = await createClient().auth.signUp({
    email: normalized,
    password,
    options: { emailRedirectTo: confirmRedirect(), captchaToken: captcha.token },
  });
  if (error) return { ok: false, failure: describeAuthError(error) };

  rememberPendingAuth({ email: normalized, kind: "email" });
  return { ok: true, signedIn: !!data.session };
}

export async function resendSignUpCode(
  email: string,
  getCaptchaToken: CaptchaTokenProvider
): Promise<{ ok: true } | { ok: false; failure: AuthFailure }> {
  const captcha = await captchaTokenOrFailure(getCaptchaToken);
  if ("failure" in captcha) return { ok: false, failure: captcha.failure };
  const { error } = await createClient().auth.resend({
    type: "signup",
    email: normalizeEmail(email),
    options: { emailRedirectTo: confirmRedirect(), captchaToken: captcha.token },
  });
  if (error) return { ok: false, failure: describeAuthError(error) };
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Sign in
// ---------------------------------------------------------------------------------------------

export type SignInResult =
  | { ok: true; region: Region | undefined; switchedRegion: boolean }
  | { ok: false; failure: AuthFailure; region?: Region };

/**
 * Tries the active region's project first and, on `invalid_credentials`, the other one -- an
 * account lives in exactly one region and the user may not know which. That reveals nothing: the
 * only outcome is "signed in" or "invalid email or password". Any other failure (rate limit,
 * unconfirmed email, captcha) stops the loop, since retrying elsewhere can't fix it. On success in
 * the non-active region the active region is switched to it; the caller must then do a full page
 * load, because `AuthProvider` is bound to the region that was active when it mounted.
 */
export async function signInWithPasswordAcrossRegions(
  email: string,
  password: string,
  getCaptchaToken: CaptchaTokenProvider
): Promise<SignInResult> {
  const normalized = normalizeEmail(email);
  const startedIn = isMultiRegionEnabled() ? getActiveRegion() : undefined;
  let lastFailure = describeAuthError({ code: "invalid_credentials" });

  for (const region of regionOrder()) {
    const captcha = await captchaTokenOrFailure(getCaptchaToken);
    if ("failure" in captcha) return { ok: false, failure: captcha.failure, region };

    const { error } = await clientFor(region).auth.signInWithPassword({
      email: normalized,
      password,
      options: { captchaToken: captcha.token },
    });
    if (!error) {
      if (region) setActiveRegion(region);
      return { ok: true, region, switchedRegion: !!region && region !== startedIn };
    }

    const failure = describeAuthError(error);
    if (failure.code !== "invalid_credentials") {
      // The password matched here but the account can't sign in yet (unconfirmed): make this the
      // active region so the "enter your code" screen talks to the project that holds the account.
      if (failure.code === "email_not_confirmed" && region) setActiveRegion(region);
      return { ok: false, failure, region };
    }
    lastFailure = failure;
  }
  return { ok: false, failure: lastFailure };
}

// ---------------------------------------------------------------------------------------------
// Password reset
// ---------------------------------------------------------------------------------------------

/**
 * Asks BOTH regions to send a reset email: only the project that actually holds the account sends
 * one, and asking both is how the user never has to know which region that is. Always looks like a
 * success to the caller unless every region refused for a reason the user can act on (rate limit,
 * captcha) -- "this email has no account" is never reported.
 */
export async function requestPasswordReset(
  email: string,
  getCaptchaToken: CaptchaTokenProvider
): Promise<{ ok: true } | { ok: false; failure: AuthFailure }> {
  const normalized = normalizeEmail(email);
  let actionable: AuthFailure | null = null;
  let anySucceeded = false;

  for (const region of regionOrder()) {
    const captcha = await captchaTokenOrFailure(getCaptchaToken);
    if ("failure" in captcha) return { ok: false, failure: captcha.failure };

    const { error } = await clientFor(region).auth.resetPasswordForEmail(normalized, {
      redirectTo: confirmRedirect(),
      captchaToken: captcha.token,
    });
    if (!error) {
      anySucceeded = true;
      continue;
    }
    const failure = describeAuthError(error);
    if (failure.code === "rate_limited" || failure.code === "captcha_failed" || failure.code === "network") {
      actionable ??= failure;
    }
    // Anything else (e.g. no such user) is deliberately swallowed.
  }

  if (!anySucceeded && actionable) return { ok: false, failure: actionable };
  rememberPendingAuth({ email: normalized, kind: "recovery" });
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------
// Verify a confirmation / recovery / email-change token or code
// ---------------------------------------------------------------------------------------------

export type VerifyType = "email" | "recovery" | "email_change";

export type VerifyArgs =
  | { type: VerifyType; tokenHash: string; region?: Region }
  | { type: VerifyType; email: string; code: string };

export type VerifyResult = { ok: true; region: Region | undefined } | { ok: false; failure: AuthFailure };

/**
 * Completes a one-time token and leaves a session behind in the project that issued it, and that
 * project as the active region. A `token_hash` from an email link carries its region in the URL
 * (each project's template bakes in its own); a typed code doesn't, so it is tried against the
 * active region first and then the other. Callers must follow success with a full page load
 * (`window.location.assign`) -- `AuthProvider` is bound to the region active when it mounted.
 */
export async function verifyAuthToken(args: VerifyArgs): Promise<VerifyResult> {
  const regions: Array<Region | undefined> =
    "tokenHash" in args && args.region ? [args.region] : regionOrder();
  let lastFailure = describeAuthError({ code: "otp_expired" });

  for (const region of regions) {
    const client = clientFor(region);
    const { error } =
      "tokenHash" in args
        ? await client.auth.verifyOtp({ token_hash: args.tokenHash, type: args.type })
        : await client.auth.verifyOtp({ email: normalizeEmail(args.email), token: args.code.trim(), type: args.type });
    if (!error) {
      if (region) setActiveRegion(region);
      return { ok: true, region };
    }
    const failure = describeAuthError(error);
    // Wrong/expired code in this project (GoTrue says `otp_expired` for both): the other one may
    // hold the account. Anything else (rate limit, network) won't be fixed by asking elsewhere.
    if (failure.code !== "invalid_code") return { ok: false, failure };
    lastFailure = failure;
  }
  return { ok: false, failure: lastFailure };
}

// ---------------------------------------------------------------------------------------------
// Signed-in account changes
// ---------------------------------------------------------------------------------------------

/**
 * Re-checks the signed-in person's CURRENT password before something sensitive (changing the
 * password or the email, moving region). It is a real sign-in against the active region's project
 * -- the only way to verify a password from the browser -- so it needs a captcha token like any
 * other and refreshes the session as a side effect (same user, nothing else changes).
 */
export async function confirmCurrentPassword(
  email: string,
  password: string,
  getCaptchaToken: CaptchaTokenProvider
): Promise<{ ok: true } | { ok: false; failure: AuthFailure }> {
  const captcha = await captchaTokenOrFailure(getCaptchaToken);
  if ("failure" in captcha) return { ok: false, failure: captcha.failure };
  const { error } = await createClient().auth.signInWithPassword({
    email: normalizeEmail(email),
    password,
    options: { captchaToken: captcha.token },
  });
  if (error) {
    const failure = describeAuthError(error);
    return {
      ok: false,
      failure:
        failure.code === "invalid_credentials"
          ? { code: "invalid_credentials", message: "That isn't your current password." }
          : failure,
    };
  }
  return { ok: true };
}

/** Asks Supabase to send the confirmation for a new email address (to the NEW address only -- the
 * Dashboard's "Secure email change" stays off). The change applies once that code/link is used. */
export async function requestEmailChange(newEmail: string): Promise<{ ok: true } | { ok: false; failure: AuthFailure }> {
  const normalized = normalizeEmail(newEmail);
  const { error } = await createClient().auth.updateUser({ email: normalized }, { emailRedirectTo: confirmRedirect() });
  if (error) return { ok: false, failure: describeAuthError(error) };
  rememberPendingAuth({ email: normalized, kind: "email_change" });
  return { ok: true };
}

/** Sets or changes the password of the signed-in account (also how a Google-only account adds one).
 * Changing a password usually means "someone else may have it", so once it is saved every OTHER
 * session of the account is signed out; this one stays. */
export async function updatePassword(password: string): Promise<{ ok: true } | { ok: false; failure: AuthFailure }> {
  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { ok: false, failure: describeAuthError(error) };
  await supabase.auth.signOut({ scope: "others" });
  return { ok: true };
}
