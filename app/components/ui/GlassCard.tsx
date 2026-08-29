import { forwardRef, type HTMLAttributes } from "react";

interface GlassCardProps extends HTMLAttributes<HTMLDivElement> {
  padding?: "md" | "sm" | "lg";
  tone?: "default" | "danger" | "gold";
}

const PADDING = {
  md: "p-7",
  sm: "p-5",
  lg: "px-8 py-[30px]",
};

const TONE = {
  default: "border-border-soft bg-bg-cards",
  danger: "border-accent-red/25 bg-[linear-gradient(135deg,rgb(255_34_0/0.06)_0%,rgb(17_24_39/0.8)_100%)]",
  gold: "border-accent-gold/30 bg-[linear-gradient(135deg,rgb(255_210_0/0.1)_0%,rgb(17_24_39/0.8)_100%)]",
};

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(function GlassCard(
  { padding = "md", tone = "default", className, children, ...rest },
  ref
) {
  const classes = [
    "relative rounded-2xl border backdrop-blur-[10px] transition-[transform,border-color] duration-300 ease-in-out h-full",
    TONE[tone],
    PADDING[padding],
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div ref={ref} className={classes} {...rest}>
      {children}
    </div>
  );
});
