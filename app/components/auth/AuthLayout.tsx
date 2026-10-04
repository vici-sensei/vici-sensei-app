import type { ReactNode } from "react";
import { Logo } from "@/app/components/ui/Logo";

/** The shell shared by every pre-login page except /login's hero: radial glow, logo, a heading and
 * a short line under it, then the form. */
export function AuthLayout({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-y-auto px-6 py-8 before:pointer-events-none before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_50%_20%,rgb(255_74_90/0.1)_0%,transparent_55%)]">
      <div className="relative w-full max-w-[420px]">
        <Logo size={72} className="mx-auto mb-6" />
        <h1 className="mb-2 text-center text-[1.9rem] font-extrabold leading-tight tracking-[-0.5px]">{title}</h1>
        {subtitle ? (
          <p className="mb-7 text-center text-[0.95rem] leading-[1.6] text-text-muted">{subtitle}</p>
        ) : (
          <div className="mb-7" />
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

export function OrDivider() {
  return (
    <div className="my-6 flex items-center gap-3 text-xs font-bold uppercase tracking-[1px] text-text-muted">
      <span className="h-px flex-1 bg-white/10" />
      or
      <span className="h-px flex-1 bg-white/10" />
    </div>
  );
}
