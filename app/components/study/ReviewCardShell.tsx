import { useEffect, type ReactNode } from "react";
import type { Rating } from "@/lib/types";
import { RatingGrid } from "./RatingGrid";
import { Button } from "@/app/components/ui/Button";
import type { CardFlash } from "./useTypedReviewCard";

interface Props {
  label: string;
  flash: CardFlash;
  prompt: ReactNode;
  subtitle: string;
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
  flash,
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
    <div
      className={`relative w-full max-w-[560px] rounded-3xl border bg-bg-cards px-10 py-14 text-center backdrop-blur-[10px] transition-[border-color,box-shadow] duration-300 ${
        flash === "correct"
          ? "border-accent-blue/50 shadow-[0_0_40px_rgba(0,210,255,0.15)]"
          : flash === "wrong"
            ? "border-accent-red/50 shadow-[0_0_40px_rgba(255,74,90,0.2)]"
            : "border-border-soft"
      }`}
    >
      <div className="mb-6 text-xs font-extrabold uppercase tracking-[1.5px] text-accent-blue">{label}</div>

      {prompt}

      <div className="mt-1 text-[0.85rem] text-text-muted">{subtitle}</div>

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
