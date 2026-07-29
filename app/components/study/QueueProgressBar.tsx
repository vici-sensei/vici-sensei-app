interface QueueProgressBarProps {
  completed: number;
  total: number;
  onExit: () => void;
}

export function QueueProgressBar({ completed, total, onExit }: QueueProgressBarProps) {
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;

  return (
    <div className="flex items-center gap-4 px-7 py-5">
      <button
        type="button"
        className="flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full border-none bg-white/5 text-text-muted [&>svg]:h-4 [&>svg]:w-4"
        onClick={onExit}
        aria-label="Exit study session"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          className="h-full rounded-full bg-[linear-gradient(90deg,var(--color-accent-red),var(--color-accent-blue))] transition-[width] duration-400 ease-linear"
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="whitespace-nowrap text-[0.85rem] font-bold tabular-nums text-text-muted">
        {completed} / {total}
      </div>
    </div>
  );
}
