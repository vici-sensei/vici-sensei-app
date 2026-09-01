import { useEffect, type ReactNode } from "react";
import type { Rating, RatingPreviews } from "@/lib/types";
import type { ReviewAccent } from "@/lib/study/accent";
import { RatingGrid } from "./RatingGrid";
import { StudyCardShell } from "./StudyCardShell";
import { Button } from "@/app/components/ui/Button";
import { ANSWER_FORM_ID } from "./AnswerForm";

interface Props {
  label: string;
  accent: ReviewAccent;
  prompt: ReactNode;
  subtitle: ReactNode;
  revealed: boolean;
  answerForm: ReactNode;
  // Whether the (not yet revealed) typed answer can be submitted -- mirrors the `disabled ||
  // !answer.trim()` guard each review hook's own handleCheck applies, duplicated here so the
  // Check button can sit in the bottom action slot instead of inside answerForm itself.
  checkDisabled: boolean;
  revealContent: ReactNode;
  correct: boolean;
  disabled: boolean;
  ratingPreviews: RatingPreviews;
  onRate: (rating: Rating) => void;
  onContinue: () => void;
  // Set by the post-introduction kana drill (ReviewCardKanaReading's drillMode): a correct
  // answer shows the Continue button instead of the Hard/Good/Easy grid -- useTypedReviewCard's
  // handleContinue rates it 2 once pressed.
  hideRatingOnCorrect?: boolean;
}

export function ReviewCardShell({
  label,
  accent,
  prompt,
  subtitle,
  revealed,
  answerForm,
  checkDisabled,
  revealContent,
  correct,
  disabled,
  ratingPreviews,
  onRate,
  onContinue,
  hideRatingOnCorrect,
}: Props) {
  const showContinue = revealed && (!correct || hideRatingOnCorrect);

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
        {!revealed && (
          <Button type="submit" form={ANSWER_FORM_ID} variant="secondary" className="min-w-[min(220px,100%)]" disabled={checkDisabled}>
            Check
          </Button>
        )}
        {revealed &&
          (correct && !hideRatingOnCorrect ? (
            <RatingGrid visible disabled={disabled} hideAgain accent={accent} previews={ratingPreviews} onRate={onRate} />
          ) : (
            <Button variant="secondary" className="min-w-[min(220px,100%)]" disabled={disabled} onClick={onContinue}>
              Continue
            </Button>
          ))}
      </div>
    </StudyCardShell>
  );
}
