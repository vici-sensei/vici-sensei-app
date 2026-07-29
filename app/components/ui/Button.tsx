import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary";
  size?: "md" | "sm";
  danger?: boolean;
  loading?: boolean;
  children: ReactNode;
}

export function Button({
  variant = "primary",
  size = "md",
  danger = false,
  loading = false,
  disabled,
  className,
  children,
  ...rest
}: ButtonProps) {
  const classes = [
    variant === "primary" ? "btn-primary" : "btn-secondary",
    size === "sm" ? "btn-sm" : "",
    danger ? "btn-danger" : "",
    loading ? "is-loading" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button className={classes} disabled={disabled || loading} {...rest}>
      <span className="spinner" style={loading ? { display: "inline-block" } : undefined} />
      <span className="btn-label">{children}</span>
    </button>
  );
}
