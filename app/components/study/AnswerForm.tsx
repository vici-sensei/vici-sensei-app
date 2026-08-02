import { useEffect, useRef, type ClipboardEvent, type DragEvent, type FormEvent } from "react";
import { Button } from "@/app/components/ui/Button";

const FOCUS_ACCENT_CLASSES = {
  violet: "focus:border-accent-violet/40",
  blue: "focus:border-accent-blue/40",
  orange: "focus:border-accent-orange/40",
} as const;

interface Props {
  answer: string;
  onAnswerChange: (value: string) => void;
  onSubmit: (event: FormEvent) => void;
  placeholder: string;
  disabled: boolean;
  accent: keyof typeof FOCUS_ACCENT_CLASSES;
}

export function AnswerForm({ answer, onAnswerChange, onSubmit, placeholder, disabled, accent }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!disabled) inputRef.current?.focus();
  }, [disabled]);

  const preventClipboardBypass = (event: ClipboardEvent<HTMLInputElement> | DragEvent<HTMLInputElement>) => {
    event.preventDefault();
  };

  return (
    <form onSubmit={onSubmit} className="mt-7 flex flex-col items-center gap-3">
      <input
        ref={inputRef}
        type="text"
        value={answer}
        onChange={(e) => onAnswerChange(e.target.value)}
        onPaste={preventClipboardBypass}
        onDrop={preventClipboardBypass}
        onContextMenu={(e) => e.preventDefault()}
        disabled={disabled}
        placeholder={placeholder}
        className={`w-full rounded-lg border border-border-soft bg-white/[0.03] px-3.5 py-3 text-center text-[0.95rem] text-white outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${FOCUS_ACCENT_CLASSES[accent]}`}
      />
      <Button type="submit" variant="secondary" className="w-full" disabled={disabled || !answer.trim()}>
        Check
      </Button>
    </form>
  );
}
