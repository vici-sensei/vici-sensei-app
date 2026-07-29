import type { HTMLAttributes } from "react";

export function GlassCard({ className, children, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={["method-card", className ?? ""].filter(Boolean).join(" ")} {...rest}>
      {children}
    </div>
  );
}
