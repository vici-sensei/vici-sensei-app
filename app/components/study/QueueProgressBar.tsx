interface QueueProgressBarProps {
  completed: number;
  total: number;
  onExit: () => void;
}

export function QueueProgressBar({ completed, total, onExit }: QueueProgressBarProps) {
  const pct = total > 0 ? Math.min(100, Math.round((completed / total) * 100)) : 0;

  return (
    <div className="study-topbar">
      <button type="button" className="study-exit" onClick={onExit} aria-label="Exit study session">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
      <div className="queue-track">
        <div className="queue-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="queue-count">
        {completed} / {total}
      </div>
    </div>
  );
}
