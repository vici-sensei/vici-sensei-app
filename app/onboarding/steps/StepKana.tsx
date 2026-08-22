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
        Hiragana and Katakana
      </h1>
      <p className="text-sm font-bold">Do you already know these?</p>
      <div
        className={`mx-auto grid max-w-md overflow-hidden text-sm leading-[1.6] text-text-muted transition-[grid-template-rows,opacity,margin-top] duration-500 ease-out ${
          knowsKana === false ? "mt-4 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0"
        }`}
      >
        <p className="min-h-0">
          No worries if not! These are the two phonetic alphabets every word in Japanese can be written in, and
          we&apos;ll happily teach them to you first, before moving on to kanji and vocabulary.
        </p>
      </div>

      <div className="flex justify-center mt-12">
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
