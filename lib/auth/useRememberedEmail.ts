"use client";

import { useCallback, useEffect, useState } from "react";
import { clearRememberedEmail, readRememberedEmail, writeRememberedEmail } from "@/lib/auth/rememberedEmail";

/**
 * The "Email" field of /login, /signup and /forgot-password, remembered in localStorage so a refresh
 * (or hopping between those pages) doesn't lose what was typed. One shared key: the address typed on
 * one of them is already there on the others. Only the email -- never the password. It is cleared
 * again on a successful login or sign-up and on logout (lib/auth/rememberedEmail.ts).
 *
 * Like useAuthRegion, localStorage can't seed the initial state (the pages are statically exported,
 * so it would mismatch the HTML); it is read right after mount instead. The input keeps its own
 * `autoComplete="email"`, so the browser's autofill suggestions are unaffected.
 */
export function useRememberedEmail(): [string, (email: string) => void] {
  const [email, setEmailState] = useState("");

  useEffect(() => {
    function restore() {
      const saved = readRememberedEmail();
      // `prev ||` -- never overwrite something already typed (or autofilled) before this ran.
      if (saved) setEmailState((prev) => prev || saved);
    }
    restore();
  }, []);

  const setEmail = useCallback((next: string) => {
    setEmailState(next);
    if (next) writeRememberedEmail(next);
    else clearRememberedEmail();
  }, []);

  return [email, setEmail];
}
