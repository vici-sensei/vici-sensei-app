import { useEffect, type ReactNode } from "react";
import type { Rating, RatingPreviews } from "@/lib/types";
import type { ReviewAccent } from "@/lib/study/accent";
import { RatingGrid } from "./RatingGrid";
import { StudyCardShell } from "./StudyCardShell";
import { Button } from "@/app/components/ui/Button";

interface Props {
  label: string;
  accent: ReviewAccent;
  prompt: ReactNode;
  subtitle: ReactNode;
  revealed: boolean;
  answerForm: ReactNode;
  revealContent: ReactNode;
  correct: boolean;
  disabled: boolean;
  ratingPreviews: RatingPreviews;
  onRate: (rating: Rating) => void;
  onContinue: () => void;
  // Set by the post-introduction kana drill (ReviewCardKanaReading's drillMode): a correct
  // answer shows nothing here instead of the Hard/Good/Easy grid -- useTypedReviewCard's
  // autoAdvanceOnCorrect already schedules the next card on its own.
  hideRatingOnCorrect?: boolean;
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
  ratingPreviews,
  onRate,
  onContinue,
  hideRatingOnCorrect,
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
    <StudyCardShell label={label} accent={accent}>
      {prompt}

      <div className="mt-1 text-[1.1rem] font-medium text-text-muted">{subtitle}</div>

      {!revealed && answerForm}

      {revealed && <div className="mt-7 border-t border-border-soft pt-3">{revealContent}</div>}

      <div className="mt-8.5">
        {revealed &&
          (correct ? (
            hideRatingOnCorrect ? null : (
              <RatingGrid visible disabled={disabled} hideAgain accent={accent} previews={ratingPreviews} onRate={onRate} />
            )
          ) : (
            <Button variant="secondary" className="w-full" disabled={disabled} onClick={onContinue}>
              Continue
            </Button>
          ))}
      </div>
    </StudyCardShell>
  );
}
