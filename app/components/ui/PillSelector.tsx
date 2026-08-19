interface PillOption<T extends string> {
  value: T;
  label: string;
}

const VARIANT = {
  tabs: {
    wrapper: "inline-flex flex-wrap gap-1 rounded-xl border border-border-soft bg-white/[0.03] p-1",
    button: "cursor-pointer rounded-[9px] px-5 py-[9px] text-[0.88rem] font-bold",
    active: "bg-accent-red text-white",
    inactive: "text-text-muted",
  },
  compact: {
    wrapper: "flex flex-wrap gap-1.5",
    button: "cursor-pointer rounded-lg px-3.5 py-[7px] text-[0.8rem] font-bold",
    active: "bg-white/10 text-white",
    inactive: "text-text-muted hover:text-white",
  },
};

interface PillSelectorProps<T extends string> {
  options: PillOption<T>[];
  active: T;
  onChange: (value: T) => void;
  variant: keyof typeof VARIANT;
  className?: string;
}

/** Generic "pick one of N" pill row, shared by the leaderboard's metric tabs and period
 * selector -- differ only in sizing/color (variant) and outer placement (className). */
export function PillSelector<T extends string>({ options, active, onChange, variant, className }: PillSelectorProps<T>) {
  const v = VARIANT[variant];
  return (
    <div className={`${v.wrapper} ${className ?? ""}`}>
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          className={`${v.button} ${active === option.value ? v.active : v.inactive}`}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
