import type { ButtonHTMLAttributes, ReactNode } from "react";

type ButtonVariant = "primary" | "secondary";
type ButtonSize = "md" | "sm";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  danger?: boolean;
  loading?: boolean;
  loadingIconPosition?: "left" | "right";
  children: ReactNode;
}

const BASE =
  "inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl text-base font-bold text-white transition-[translate,box-shadow,opacity,background-color,border-color] duration-200 ease-out disabled:cursor-not-allowed disabled:opacity-45 disabled:shadow-none disabled:translate-y-0";

const SIZE: Record<ButtonSize, string> = {
  md: "px-8 py-[15px]",
  sm: "rounded-[10px] px-[18px] py-[9px] text-sm",
};

/**
 * Shared with plain <Link>/<a> "styled as a button" usages, which can never be
 * disabled — pass hover="hover" there instead of the default "enabled:hover"
 * (the :enabled pseudo-class never matches on anchors, so it would silently
 * kill the hover effect).
 */
export function buttonClasses({
  variant = "primary",
  size = "md",
  danger = false,
  hover = "enabled:hover",
  className,
}: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  danger?: boolean;
  hover?: "enabled:hover" | "hover";
  className?: string;
}): string {
  const variantClasses =
    variant === "primary"
      ? danger
        ? "bg-[#c81e2c] shadow-[0_0_30px_rgba(200,30,44,0.4)]"
        : `bg-accent-red shadow-[0_0_30px_rgba(255,74,90,0.4)] ${hover}:-translate-y-0.5 ${hover}:shadow-[0_0_40px_rgba(255,74,90,0.6)]`
      : danger
        ? `border border-accent-red/30 bg-white/[0.03] text-[#ff8a93] ${hover}:border-accent-red/40 ${hover}:bg-accent-red/[0.08]`
        : `border border-white/10 bg-white/[0.03] ${hover}:border-white/20 ${hover}:bg-white/[0.07]`;

  return [BASE, variantClasses, SIZE[size], className ?? ""].filter(Boolean).join(" ");
}

export function Button({
  variant = "primary",
  size = "md",
  danger = false,
  loading = false,
  loadingIconPosition = "left",
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = buttonClasses({ variant, size, danger, className });

  const spinner = (
    <span
      className={`h-[18px] w-[18px] shrink-0 animate-spin rounded-full border-[2.5px] border-white/35 border-t-white ${
        loading ? "inline-block" : "hidden"
      }`}
    />
  );

  return (
    <button className={classes} disabled={disabled || loading} {...rest}>
      {loadingIconPosition === "left" && spinner}
      <span className={`inline-flex items-center gap-2 ${loading ? "opacity-85" : ""}`}>{children}</span>
      {loadingIconPosition === "right" && spinner}
    </button>
  );
}
