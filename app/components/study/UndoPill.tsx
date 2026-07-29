interface UndoPillProps {
  visible: boolean;
  onUndo: () => void;
  disabled?: boolean;
}

export function UndoPill({ visible, onUndo, disabled }: UndoPillProps) {
  return (
    <button
      type="button"
      className={`inline-flex cursor-pointer items-center gap-2 rounded-full border border-border-soft bg-bg-main/90 px-5 py-2.5 text-[0.85rem] font-bold text-text-muted transition-[opacity,transform] duration-300 [&>svg]:h-3.5 [&>svg]:w-3.5 hover:border-white/20 hover:text-white ${
        visible ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-2.5 opacity-0"
      }`}
      onClick={onUndo}
      disabled={disabled}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
        <polyline points="1 4 1 10 7 10" />
        <path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
      </svg>
      Undo last answer
    </button>
  );
}
