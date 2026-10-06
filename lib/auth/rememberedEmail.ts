const STORAGE_KEY = "auth:email";

/** The email typed into the login / sign-up / forgot-password forms, kept in localStorage so a
 * refresh doesn't lose it (see useRememberedEmail). Never the password. Dropped again by
 * clearRememberedEmail() on a successful login, a successful sign-up and on logout -- and the
 * /privacy page says so. */
export function readRememberedEmail(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function writeRememberedEmail(email: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, email);
  } catch {
    // ignore (private browsing / quota)
  }
}

export function clearRememberedEmail() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore (private browsing / blocked storage)
  }
}
