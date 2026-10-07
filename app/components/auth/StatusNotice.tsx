import type { ComponentType, ReactNode } from "react";

const TONE = {
  blue: "border-accent-blue/30 bg-accent-blue/10 text-accent-blue",
  green: "border-accent-green/30 bg-accent-green/10 text-accent-green",
  red: "border-accent-red/30 bg-accent-red/10 text-accent-red",
} as const;

type Icon = ComponentType<{ className?: string; "aria-hidden"?: boolean | "true" | "false" }>;

/** The round, tinted icon at the top of the "something happened" screens. The colour is inherited by
 * the icon (react-icons draw with `currentColor`). */
export function StatusIcon({ icon: Icon, tone }: { icon: Icon; tone: keyof typeof TONE }) {
  return (
    <div className={`mx-auto mb-5.5 flex h-16 w-16 items-center justify-center rounded-full border ${TONE[tone]}`}>
      <Icon aria-hidden="true" className="h-6.5 w-6.5" />
    </div>
  );
}

/** A full-screen, centred message: icon, title, a few short paragraphs (the children -- plain `<p>`s,
 * spaced and styled here) and an optional row of actions below them. Used by /session-expired,
 * /account-deletion and the "can't load your account" screen. */
export function StatusPage({
  icon,
  tone,
  title,
  children,
  actions,
}: {
  icon: Icon;
  tone: keyof typeof TONE;
  title: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-6 py-[60px] text-center">
      <div className="relative w-full max-w-[440px]">
        <StatusIcon icon={icon} tone={tone} />
        <h1 className="mb-2.5 text-2xl font-extrabold">{title}</h1>
        <div className="mb-7 flex flex-col gap-2.5 text-base leading-[1.6] text-text-muted">{children}</div>
        {actions}
      </div>
    </div>
  );
}
