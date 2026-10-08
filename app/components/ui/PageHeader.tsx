import type { ReactNode } from "react";
import { Breadcrumbs, type BreadcrumbItem } from "./Breadcrumbs";

/** Title block shared by the (shell) pages: optional breadcrumbs, the page's h1 and a one-line
 * subtitle, centered on mobile and left-aligned from md up. `compact` tightens the gap under the
 * subtitle for pages that follow it with a toolbar (search, filters) instead of content. */
export function PageHeader({
  title,
  subtitle,
  breadcrumbs,
  compact = false,
}: {
  title: string;
  subtitle?: ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  compact?: boolean;
}) {
  return (
    <>
      {breadcrumbs && <Breadcrumbs items={breadcrumbs} />}
      <h1 className="mb-2 text-[2.1rem] font-extrabold leading-[1.2] tracking-[-0.8px] text-center md:text-left">{title}</h1>
      {subtitle && (
        <p
          className={`${compact ? "mb-5" : "mb-7.5"} text-base leading-[1.6] text-text-muted text-center md:text-left`}
        >
          {subtitle}
        </p>
      )}
    </>
  );
}
