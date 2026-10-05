/** The one-time line telling a student that a kanji can be pressed -- shown by whoever gets
 * `showKanjiHint` from usePressableKanji, until the first time one is actually opened. Says "Click"
 * or "Double-tap" to match the device's main pointer, the way useKanjiPress tells the two apart. */
export function KanjiHint({ className }: { className?: string }) {
  return (
    <p className={`text-xs text-text-muted ${className ?? ""}`}>
      <span className="pointer-coarse:hidden">Click</span>
      <span className="hidden pointer-coarse:inline">Double-tap</span> a kanji to see its meaning
    </p>
  );
}
