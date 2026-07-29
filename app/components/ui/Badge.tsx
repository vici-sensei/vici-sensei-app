import type { HTMLAttributes, ReactNode } from "react";

interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  color?: "red" | "blue" | "gold";
  children: ReactNode;
}

const COLOR = {
  red: "border-accent-red/30 bg-accent-red/10 text-accent-red",
  blue: "border-accent-blue/30 bg-accent-blue/10 text-accent-blue",
  gold: "border-accent-gold/30 bg-accent-gold/10 text-accent-gold",
};

export function Badge({ color = "red", className, children, ...rest }: BadgeProps) {
  const classes = [
    "inline-block rounded-full border px-4 py-1.5 text-sm font-bold tracking-[1px]",
    COLOR[color],
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  );
}
