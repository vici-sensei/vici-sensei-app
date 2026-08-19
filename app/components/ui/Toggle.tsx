interface ToggleProps {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
  className?: string;
  "aria-label"?: string;
}

export function Toggle({ checked, onChange, disabled, className, ...rest }: ToggleProps) {
  return (
    <label className={["relative h-[26px] w-[46px] shrink-0", className].filter(Boolean).join(" ")}>
      <input
        type="checkbox"
        className="peer h-0 w-0 opacity-0"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        {...rest}
      />
      <span className="absolute inset-0 cursor-pointer rounded-full bg-white/10 transition-colors duration-200 before:absolute before:left-[3px] before:top-[3px] before:h-5 before:w-5 before:rounded-full before:bg-white before:transition-transform before:duration-200 peer-checked:bg-accent-red peer-checked:before:translate-x-5 peer-disabled:cursor-not-allowed peer-disabled:opacity-40" />
    </label>
  );
}
