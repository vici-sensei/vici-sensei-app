"use client";

import { FaRegCopy } from "react-icons/fa6";
import { useToast } from "@/app/components/ui/Toast";
import { isKanjiChar } from "@/lib/study/furigana";

const SIZE_CLASSES = {
  // Beside a word set in a large heading / list row.
  md: "h-8 w-8 text-sm",
  // Inline in a line of body text, where a taller button would stretch the row.
  sm: "h-6 w-6 text-xs",
} as const;

interface Props {
  /** The word exactly as the page shows it. */
  text: string;
  size?: keyof typeof SIZE_CLASSES;
  className?: string;
}

/** Copies a word to the clipboard, on the dictionary pages where its kanji are pressable
 * (usePressableKanji) and therefore no longer selectable -- the way to copy a word to a translator
 * or another dictionary. Renders nothing for a word with no kanji: its kana stay selectable. */
export function CopyWordButton({ text, size = "md", className }: Props) {
  const { showToast } = useToast();
  if (!Array.from(text).some(isKanjiChar)) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      showToast(`Copied ${text}`);
    } catch {
      showToast("Couldn't copy to the clipboard", "error");
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={`Copy ${text}`}
      title="Copy word"
      className={`inline-flex ${SIZE_CLASSES[size]} shrink-0 cursor-pointer items-center justify-center rounded-lg font-normal text-text-muted transition-colors hover:bg-white/[0.07] hover:text-white active:bg-white/10 ${className ?? ""}`}
    >
      <FaRegCopy />
    </button>
  );
}
