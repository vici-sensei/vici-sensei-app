export function StepKana({
  knowsKana,
  onChange,
}: {
  /** `null` until the user actively picks one of the two options -- neither starts selected. */
  knowsKana: boolean | null;
  onChange: (knowsKana: boolean) => void;
}) {
  return (
    <>
      <h1 className="mb-2 text-[1.5rem] font-extrabold tracking-[-0.5px]">
        Do you already know hiragana and katakana?
      </h1>
      <p className="mx-auto mb-6 max-w-md text-sm leading-[1.6] text-text-muted">
        These are the two phonetic alphabets every word in Japanese can be written in. If you&apos;re just starting
        out, we&apos;ll teach them to you first, before kanji and vocabulary.
      </p>

      <div className="flex justify-center">
        <div className="inline-flex gap-1 rounded-full border border-border-soft bg-white/[0.03] p-1">
          <button
            type="button"
            onClick={() => onChange(true)}
            className={`rounded-full px-4 py-2 text-sm font-bold transition-colors duration-200 ${
              knowsKana === true
                ? "bg-accent-red text-white shadow-[0_0_15px_var(--color-accent-red-glow)]"
                : knowsKana === null
                  ? "bg-white/[0.03] text-text-muted hover:text-white"
                  : "text-text-muted hover:text-white"
            }`}
          >
            Yes
          </button>
          <button
            type="button"
            onClick={() => onChange(false)}
            className={`rounded-full px-4 py-2 text-sm font-bold transition-colors duration-200 ${
              knowsKana === false
                ? "bg-accent-red text-white shadow-[0_0_15px_var(--color-accent-red-glow)]"
                : knowsKana === null
                  ? "bg-white/[0.03] text-text-muted hover:text-white"
                  : "text-text-muted hover:text-white"
            }`}
          >
            No
          </button>
        </div>
      </div>
    </>
  );
}
