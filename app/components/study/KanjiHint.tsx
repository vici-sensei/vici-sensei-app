/** The one-time line telling a student that a kanji can be pressed -- shown by whoever gets
 * `showKanjiHint` from usePressableKanji, until the first time one is actually opened. */
export function KanjiHint({ className }: { className?: string }) {
  return <p className={`text-xs text-text-muted ${className ?? ""}`}>Hold or double-tap a kanji to see its meaning</p>;
}
