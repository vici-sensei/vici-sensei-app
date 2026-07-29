import type { HTMLAttributes, ReactNode } from "react";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  color?: "red" | "blue" | "gold";
  children: ReactNode;
}

export function Badge({ color = "red", className, children, ...rest }: BadgeProps) {
  const classes = ["badge", color === "blue" ? "blue" : color === "gold" ? "gold" : "", className ?? ""]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  );
}
