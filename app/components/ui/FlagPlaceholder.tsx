// Sized to match the real `.fi` flag icons exactly (1.333333em x 1em, see
// flag-icons/css/flag-icons.min.css) rather than a guessed pixel size, so the placeholder
// occupies the identical box a real flag would.
export function FlagPlaceholder() {
  return (
    <div className="flex h-[1em] w-[1.333333em] shrink-0 animate-pulse flex-col overflow-hidden rounded-[2px]">
      <div className="flex-1 bg-white/20" />
      <div className="flex-1 bg-white/12" />
      <div className="flex-1 bg-white/[0.06]" />
    </div>
  );
}
