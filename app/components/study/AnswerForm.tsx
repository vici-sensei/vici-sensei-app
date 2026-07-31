import { useEffect, useRef, type FormEvent } from "react";
import { Button } from "@/app/components/ui/Button";

interface Props {
  answer: string;
  onAnswerChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  placeholder: string;
  disabled: boolean;
}

export function AnswerForm({ answer, onAnswerChange, onSubmit, placeholder, disabled }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  return (
    <form onSubmit={onSubmit} className="mt-7 flex flex-col items-center gap-3">
      <input
        ref={inputRef}
        type="text"
        value={answer}
        onChange={(e) => onAnswerChange(e.target.value)}
        disabled={disabled}
        placeholder={placeholder}
        className="w-full rounded-lg border border-border-soft bg-white/[0.03] px-3.5 py-3 text-center text-[0.95rem] text-white outline-none transition-colors focus:border-accent-blue/40 disabled:cursor-not-allowed disabled:opacity-60"
      />
      <Button type="submit" variant="secondary" className="w-full" disabled={disabled || !answer.trim()}>
        Check
      </Button>
    </form>
  );
}
