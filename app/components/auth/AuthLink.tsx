import type { ComponentProps, ReactNode } from "react";
import Link from "next/link";

/** The links of the pre-login pages. `accent` (the default) is the blue, underline-on-hover link in
 * the middle of a sentence or on its own ("Create an account", "Forgot password?"); `weight` picks
 * bold for a standalone link or semibold for one inside running text. `muted` is the quiet
 * "Back to log in" line that only lights up on hover. */
export function AuthLink({
  tone = "accent",
  weight = "bold",
  className,
  ...rest
}: ComponentProps<typeof Link> & { tone?: "accent" | "muted"; weight?: "bold" | "semibold" }) {
  const look =
    tone === "muted"
      ? "text-text-muted hover:text-white"
      : `${weight === "bold" ? "font-bold" : "font-semibold"} text-accent-blue hover:underline`;
  return <Link {...rest} className={`${look} ${className ?? ""}`} />;
}

/** The line under a form that points to the neighbouring page ("New here? Create an account"). */
export function AuthFooter({ children }: { children: ReactNode }) {
  return <p className="mt-6 text-center text-[0.9rem] text-text-muted">{children}</p>;
}
