import { Skeleton } from "@/app/components/ui/Skeleton";

// Most vocabulary words are 2 kanji, each with its own 2-character furigana reading above it --
// the placeholders mirror that shape (two ruby-sized blocks side by side) instead of one
// undifferentiated bar. Each size is the real word at that spot's font size, so the block is the
// same height as the text that replaces it and nothing jumps once the data arrives.
const SIZES = {
  // The vocabulary list's rows (text-3xl word, default line-height).
  sm: { box: "h-[57.3px] shrink-0 gap-1.5", column: "gap-1", ruby: "h-3 w-5 rounded", kanji: "h-9 w-8 rounded-md" },
  // A kanji detail page's example-word rows: same type size as the list, but leading-none and
  // tighter row padding, so the real box is shorter (54 vs 57.3px).
  md: { box: "h-[54px] shrink-0 gap-1.5", column: "gap-1", ruby: "h-3 w-5 rounded", kanji: "h-9 w-8 rounded-md" },
  // A vocabulary detail page's hero word (text-5xl: 48px font vs 30px in the list).
  lg: { box: "h-[81.6px] gap-2.5", column: "gap-1.5", ruby: "h-4 w-8 rounded", kanji: "h-13 w-12 rounded-lg" },
} as const;

export function PlaceholderRubyWord({ size, className = "" }: { size: keyof typeof SIZES; className?: string }) {
  const s = SIZES[size];
  return (
    <div className={`flex items-end ${s.box} ${className}`.trimEnd()}>
      {[0, 1].map((k) => (
        <div key={k} className={`flex flex-col items-center ${s.column}`}>
          <Skeleton className={s.ruby} />
          <Skeleton className={s.kanji} />
        </div>
      ))}
    </div>
  );
}
