import type { ReactNode } from "react";
import { Logo } from "@/app/components/ui/Logo";
import { fieldHint } from "@/app/components/ui/formClasses";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/passwordAuth";

/** Logo size on every pre-login page, so /login and /signup (and the rest) line up. */
export const AUTH_LOGO_SIZE = 72;

/** The shell shared by every pre-login page: radial glow, logo, an optional heading and short line
 * under it, then the content. */
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title?: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-y-auto px-6 py-8 before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_50%_20%,rgb(255_74_90/0.1)_0%,transparent_55%)]">
      <div className="relative w-full max-w-[420px]">
        <Logo size={AUTH_LOGO_SIZE} className={`mx-auto ${title ? "mb-6" : "mb-8"}`} />
        {title && (
          <>
            <h1 className="mb-2 text-center text-[1.9rem] font-extrabold leading-tight tracking-[-0.5px]">{title}</h1>
            {subtitle ? (
              <p className="mb-7 text-center text-[0.95rem] leading-[1.6] text-text-muted">{subtitle}</p>
            ) : (
              <div className="mb-7" />
            )}
          </>
        )}
        {children}
      </div>
    </div>
  );
}

/** Inline form-level message. Errors stay on screen (a toast would vanish before it is read);
 * `role="alert"` makes screen readers announce them. */
export function FormMessage({ tone, children }: { tone: "error" | "info"; children: ReactNode }) {
  return (
    <p
      role={tone === "error" ? "alert" : "status"}
      className={`rounded-lg border px-3.5 py-2.5 text-left text-[0.85rem] leading-normal ${
        tone === "error"
          ? "border-accent-red/30 bg-accent-red/10 text-[#ff8a93]"
          : "border-accent-blue/30 bg-accent-blue/10 text-accent-blue"
      }`}
    >
      {children}
    </p>
  );
}

/** One-line message under a single field, same size as `fieldHint` but in the error colour. Its
 * height is reserved even when empty: a message appearing on blur must not shift the form, or a
 * click that caused the blur (e.g. "Forgot password?") lands on the wrong spot. */
export function FieldError({ id, children }: { id: string; children?: ReactNode }) {
  return (
    <p id={id} aria-live="polite" className="mt-1.5 min-h-[1.2rem] text-[0.8rem] leading-normal text-[#ff8a93]">
      {children}
    </p>
  );
}

/** The line under the password field of /signup and /login: the rule as a hint while the field is
 * empty, the error as soon as the person starts typing something that isn't valid yet, and an empty
 * line (that still takes its height) once it is. */
export function PasswordMessage({ id, error, empty }: { id: string; error: string | null; empty: boolean }) {
  if (error || !empty) return <FieldError id={id}>{error}</FieldError>;
  return (
    <p id={id} className={fieldHint}>
      At least {MIN_PASSWORD_LENGTH} characters, with letters and digits.
    </p>
  );
}

export function OrDivider() {
  return (
    <div className="mx-auto my-6 flex w-full max-w-[360px] items-center gap-3 text-xs font-bold uppercase tracking-[1px] text-text-muted">
      <span className="h-px flex-1 bg-white/10" />
      or
      <span className="h-px flex-1 bg-white/10" />
    </div>
  );
}
