const SIZE = {
  sm: "px-2 py-0.5 text-[0.55rem]",
  lg: "px-3.5 py-1.5 text-[1.05rem]",
};

const FOIL_TEXT_GRADIENT = "linear-gradient(135deg, #fff3c4 0%, #e8b923 45%, #a9760a 55%, #f5d876 100%)";
const BORDER_COLOR = "rgba(230,185,58,0.6)";
const FILL = "linear-gradient(135deg, rgba(90,62,4,0.7), rgba(32,22,3,0.82))";

export function ProBadge({ className, size = "sm" }: { className?: string; size?: keyof typeof SIZE }) {
  return (
    <span
      className={`absolute z-10 animate-[vici-badge-shimmer_1.4s_ease-in-out_infinite_alternate] rounded-full border font-extrabold uppercase leading-none tracking-wide shadow-[0_2px_6px_rgba(0,0,0,0.35)] backdrop-blur-[6px] ${SIZE[size]} ${className ?? ""}`}
      style={{
        borderColor: BORDER_COLOR,
        backgroundImage: `${FILL}, linear-gradient(115deg, transparent 35%, rgba(255,255,255,0.95) 50%, transparent 65%)`,
        backgroundSize: "100% 100%, 250% 250%",
        backgroundRepeat: "no-repeat",
      }}
    >
      <span
        style={{
          backgroundImage: FOIL_TEXT_GRADIENT,
          WebkitBackgroundClip: "text",
          backgroundClip: "text",
          color: "transparent",
        }}
      >
        PRO
      </span>
    </span>
  );
}
