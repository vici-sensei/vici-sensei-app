import Link from "next/link";
import { FaChevronRight } from "react-icons/fa6";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export function Breadcrumbs({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="mb-3 flex flex-wrap items-center justify-center gap-1.5 text-sm text-text-muted md:justify-start"
    >
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={i} className="flex items-center gap-1.5">
            {i > 0 && <FaChevronRight className="h-2.5 w-2.5 text-text-muted/50" />}
            {!isLast && item.href ? (
              <Link href={item.href} className="hover:text-white hover:underline">
                {item.label}
              </Link>
            ) : (
              <span className={isLast ? "font-semibold text-white" : ""}>{item.label}</span>
            )}
          </span>
        );
      })}
    </nav>
  );
}
