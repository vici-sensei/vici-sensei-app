import type { ReactNode } from "react";
import { FaMinus, FaPlus } from "react-icons/fa6";
import { fieldLabel } from "@/app/components/ui/formClasses";

export const stepperButtonClass =
  "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-lg border border-border-soft bg-white/[0.04] text-white enabled:hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40 [&>svg]:h-3 [&>svg]:w-3";
export const stepperValueClass = "w-15 text-center text-[1.05rem] font-extrabold tabular-nums";

interface StepperProps {
  label: string;
  value: number | string;
  onDecrement: () => void;
  onIncrement: () => void;
  decrementDisabled?: boolean;
  incrementDisabled?: boolean;
  disabled?: boolean;
  /** Rendered below the stepper row as-is (a plain fieldHint line, an icon + colored note, ...) --
   * left to the caller rather than baked into one style, since it varies per field. */
  hint?: ReactNode;
  className?: string;
}

/** A labeled minus/value/plus stepper -- shared by the per-day count fields in
 * StudySettingsForm (new kanji, new vocabulary, max reviews, new hiragana, new katakana), which
 * were previously five copies of this same row differing only in label, value, handlers, and hint. */
export function Stepper({
  label,
  value,
  onDecrement,
  onIncrement,
  decrementDisabled,
  incrementDisabled,
  disabled,
  hint,
  className,
}: StepperProps) {
  return (
    <div className={className}>
      <label className={fieldLabel}>{label}</label>
      <div className="flex items-center gap-2.5">
        <button type="button" className={stepperButtonClass} onClick={onDecrement} disabled={disabled || decrementDisabled}>
          <FaMinus />
        </button>
        <span className={stepperValueClass}>{value}</span>
        <button type="button" className={stepperButtonClass} onClick={onIncrement} disabled={disabled || incrementDisabled}>
          <FaPlus />
        </button>
      </div>
      {hint}
    </div>
  );
}
