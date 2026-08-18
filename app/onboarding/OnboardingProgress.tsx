export function OnboardingProgress({
  step,
  total,
  maxReached,
  onStepClick,
}: {
  step: number;
  total: number;
  /** The furthest step index the user has already reached -- only steps up to here are clickable. */
  maxReached: number;
  onStepClick: (index: number) => void;
}) {
  return (
    <div>
      <div className="mb-2.5 flex justify-center gap-2">
        {Array.from({ length: total }).map((_, i) => {
          const isCurrent = i === step;
          const reached = i <= maxReached;
          return (
            <button
              key={i}
              type="button"
              onClick={() => onStepClick(i)}
              disabled={!reached}
              aria-label={`Go to step ${i + 1}`}
              aria-current={isCurrent ? "step" : undefined}
              className={`h-1.5 flex-1 max-w-16 rounded-full transition-colors duration-300 ${
                isCurrent
                  ? "bg-accent-red shadow-[0_0_10px_var(--color-accent-red-glow)]"
                  : reached
                    ? "bg-accent-red/30 hover:bg-accent-red/60"
                    : "bg-white/10"
              } ${reached ? "cursor-pointer" : "cursor-not-allowed"}`}
            />
          );
        })}
      </div>
      <p className="text-center text-[0.75rem] font-bold uppercase tracking-[0.6px] text-text-muted">
        Step {step + 1} of {total}
      </p>
    </div>
  );
}
