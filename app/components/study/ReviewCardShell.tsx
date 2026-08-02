import { useEffect, type ReactNode } from "react";
import type { Rating } from "@/lib/types";
import { RatingGrid } from "./RatingGrid";
import { Button } from "@/app/components/ui/Button";

const ACCENT_CLASSES = {
  violet: "text-accent-violet",
  blue: "text-accent-blue",
  orange: "text-accent-orange",
} as const;

interface Props {
  label: string;
  accent: keyof typeof ACCENT_CLASSES;
  prompt: ReactNode;
  subtitle: ReactNode;
  revealed: boolean;
  answerForm: ReactNode;
  revealContent: ReactNode;
  correct: boolean;
  disabled: boolean;
  onRate: (rating: Rating) => void;
  onContinue: () => void;
}

export function ReviewCardShell({
  label,
  accent,
  prompt,
  subtitle,
  revealed,
  answerForm,
  revealContent,
  correct,
  disabled,
  onRate,
  onContinue,
}: Props) {
  const showContinue = revealed && !correct;

  useEffect(() => {
    if (!showContinue || disabled) return;
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Enter") {
        event.preventDefault();
        onContinue();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showContinue, disabled, onContinue]);

  return (
    <div className="relative w-full max-w-[560px] rounded-3xl border border-border-soft bg-bg-cards px-10 py-14 text-center backdrop-blur-[10px]">
      <div className={`mb-6 text-xs font-extrabold uppercase tracking-[1.5px] ${ACCENT_CLASSES[accent]}`}>{label}</div>

      {prompt}

      <div className="mt-1 text-[1.1rem] font-medium text-text-muted">{subtitle}</div>

      {!revealed && answerForm}

      {revealed && <div className="mt-7 border-t border-border-soft pt-7">{revealContent}</div>}

      <div className="mt-8.5">
        {revealed &&
          (correct ? (
            <RatingGrid visible disabled={disabled} hideAgain onRate={onRate} />
          ) : (
            <Button variant="secondary" className="w-full" disabled={disabled} onClick={onContinue}>
              Continue
            </Button>
          ))}
      </div>
    </div>
  );
}
