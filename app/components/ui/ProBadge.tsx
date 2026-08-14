const SIZE = {
  sm: "px-2 py-0.5 text-[0.55rem] text-[#3d2b00]",
  lg: "px-3.5 py-1.5 text-[1.05rem] text-[#6b4e00]",
};

export function ProBadge({ className, size = "sm" }: { className?: string; size?: keyof typeof SIZE }) {
  return (
    <span
      className={`absolute z-10 animate-[vici-badge-shimmer_2.6s_ease-in-out_infinite] rounded-full border border-accent-gold/55 font-extrabold uppercase leading-none tracking-wide shadow-[0_2px_6px_rgba(0,0,0,0.35)] backdrop-blur-[6px] ${SIZE[size]} ${className ?? ""}`}
      style={{
        backgroundImage:
          "linear-gradient(135deg, rgba(255,210,0,0.18), rgba(255,210,0,0.06)), linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.95) 50%, transparent 65%)",
        backgroundSize: "100% 100%, 250% 250%",
        backgroundRepeat: "no-repeat",
      }}
    >
      PRO
    </span>
  );
}
