import { FaLock } from "react-icons/fa6";

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
      <span className="absolute inset-0 cursor-pointer rounded-full bg-white/10 transition-colors duration-200 peer-checked:bg-accent-red peer-disabled:cursor-not-allowed peer-disabled:opacity-40" />
      <span className="pointer-events-none absolute left-[3px] top-[3px] flex h-5 w-5 items-center justify-center rounded-full bg-white transition-transform duration-200 peer-checked:translate-x-5">
        {disabled ? <FaLock className="h-2.5 w-2.5 text-black/50" /> : null}
      </span>
    </label>
  );
}
