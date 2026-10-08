import type { ReactNode } from "react";

/** A centered message that takes over the whole screen: "couldn't load X", "nothing to show", the
 * error boundaries. `children` is the explanation under the title, `actions` the buttons under that
 * (centered, wrapping), `header` something above the title (a close button) and `footer` a last
 * line below the buttons (an error reference). `viewportHeight` sizes it to the app's visual
 * viewport (--app-height, set by useViewportHeight) instead of min-h-screen, for screens that
 * scroll inside a fixed-height shell. Presentational only, so it also works in global-error. */
export function FullScreenMessage({
  title,
  children,
  actions,
  header,
  footer,
  viewportHeight = false,
}: {
  title: string;
  children?: ReactNode;
  actions?: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  viewportHeight?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-center px-6 py-[60px] text-center ${
        viewportHeight ? "overflow-y-auto" : "min-h-screen"
      }`}
      style={viewportHeight ? { height: "var(--app-height, 100dvh)" } : undefined}
    >
      <div className="w-full max-w-[380px]">
        {header}
        <h1 className="mb-2 text-lg font-bold text-white">{title}</h1>
        {children !== undefined && (
          <p className={`text-[0.9rem] leading-[1.6] text-text-muted ${actions ? "mb-6" : ""}`.trimEnd()}>{children}</p>
        )}
        {actions && <div className="flex flex-wrap items-center justify-center gap-2.5">{actions}</div>}
        {footer}
      </div>
    </div>
  );
}
