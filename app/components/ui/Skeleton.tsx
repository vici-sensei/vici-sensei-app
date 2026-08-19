export function Skeleton({ className = "" }: { className?: string }) {
  // Tailwind emits `.rounded-lg` after `.rounded-full` in the generated stylesheet, so
  // stacking both classes always resolves to `.rounded-lg` regardless of source order in
  // `className` -- only ever emit the default when the caller didn't already pass a radius.
  const rounded = /\brounded(?:-\S+)?\b/.test(className) ? "" : "rounded-lg";
  return <div className={`animate-pulse ${rounded} bg-white/[0.06] ${className}`} />;
}
