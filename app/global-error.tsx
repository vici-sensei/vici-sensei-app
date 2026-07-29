"use client";

import "./globals.css";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en" className="antialiased">
      <body>
        <div className="error-screen">
          <div className="error-card">
            <div className="error-icon-wrap">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <h1>Something went wrong</h1>
            <p className="subtitle">A critical error occurred. Please try reloading the page.</p>
            <button className="btn-primary" onClick={() => reset()}>
              <span className="btn-label">Retry</span>
            </button>
            {error.digest && <div className="error-detail">Error reference: {error.digest}</div>}
          </div>
        </div>
      </body>
    </html>
  );
}
