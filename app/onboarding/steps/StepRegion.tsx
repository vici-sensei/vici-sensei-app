import { FaCheck, FaEarthAmericas, FaEarthEurope } from "react-icons/fa6";
import { orderedServerRegions, type ServerRegion } from "@/lib/serverRegion";

const REGION_META: Record<ServerRegion, { icon: typeof FaEarthAmericas; description: string }> = {
  America: { icon: FaEarthAmericas, description: "North & South America" },
  Europe: { icon: FaEarthEurope, description: "Europe, Africa & Western Asia" },
};

export function StepRegion({
  region,
  recommended,
  onChange,
}: {
  region: ServerRegion;
  recommended: ServerRegion;
  onChange: (region: ServerRegion) => void;
}) {
  return (
    <>
      <h1 className="mb-2 text-[1.5rem] font-extrabold tracking-[-0.5px]">Connect to our server</h1>
      <p className="mx-auto mb-6 max-w-md text-sm leading-[1.6] text-text-muted">
        For the best speed, please choose the continent closest to your physical location.
      </p>
      <div className="flex flex-col gap-3 text-left">
        {orderedServerRegions(recommended).map((option) => {
          const { icon: Icon, description } = REGION_META[option];
          const selected = option === region;
          return (
            <button
              key={option}
              type="button"
              onClick={() => onChange(option)}
              className={`relative flex w-full items-center gap-4 rounded-2xl border p-4 text-left transition-all duration-200 ${
                selected
                  ? "border-accent-red bg-accent-red/[0.08] shadow-[0_0_20px_var(--color-accent-red-glow)]"
                  : "border-border-soft bg-white/[0.03] hover:border-white/20"
              }`}
            >
              <div
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-xl ${
                  selected ? "bg-accent-red text-white" : "bg-white/[0.06] text-text-muted"
                }`}
              >
                <Icon />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[1.05rem] font-extrabold text-white">{option}</span>
                  {option === recommended && (
                    <span className="rounded-full border border-accent-blue/30 bg-accent-blue/10 px-2 py-0.5 text-[0.65rem] font-bold uppercase tracking-[0.5px] text-accent-blue">
                      Recommended
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-[0.8rem] text-text-muted">{description}</p>
              </div>
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                  selected ? "border-accent-red bg-accent-red text-white" : "border-white/20 text-transparent"
                }`}
              >
                <FaCheck className="h-3 w-3" />
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
