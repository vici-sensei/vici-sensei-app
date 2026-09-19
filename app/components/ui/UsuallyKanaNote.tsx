/** Marks a vocabulary word shown in kanji form even though vocabulary.usually_kana is true (JMdict
 * "uk") -- e.g. as the only example word of a kanji. Everywhere else such a word is shown as its kana
 * reading instead (see renderVocabularyWord in lib/study/furigana.tsx). Inline pill: put it in its own
 * block wrapper (or inline in running text) -- it doesn't force a line break by itself. */
export function UsuallyKanaNote({ className }: { className?: string }) {
  return (
    <span
      className={[
        "inline-block rounded-full border border-accent-blue/30 bg-accent-blue/10 px-2.5 py-0.5 text-[0.7rem] font-bold leading-tight tracking-[0.5px] text-accent-blue",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      usually written in kana
    </span>
  );
}
