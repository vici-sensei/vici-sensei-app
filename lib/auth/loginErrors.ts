import type { Region } from "@/lib/supabase/regions";

/**
 * The `?error=` values /login turns into a notice (LoginErrorNotice in app/login/page.tsx). Whoever
 * sends someone back to /login after a failed or refused sign-in builds the URL with loginErrorUrl(),
 * so the two ends can't drift apart on a misspelt string.
 *
 * - wrongRegion: the email already has an account in the other region (`region` says which one).
 * - accountMoved: the account was moved to the other region (`region` is where it lives now).
 * - callbackFailed: the OAuth return carried no usable session.
 */
export const LOGIN_ERROR = {
  wrongRegion: "wrong_region",
  accountMoved: "account_moved",
  callbackFailed: "auth_callback_failed",
} as const;

export type LoginError = (typeof LOGIN_ERROR)[keyof typeof LOGIN_ERROR];

export function loginErrorUrl(error: LoginError, region?: Region): string {
  return `/login?error=${error}${region ? `&region=${region}` : ""}`;
}
