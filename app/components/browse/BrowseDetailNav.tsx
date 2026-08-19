import Link from "next/link";
import { buttonClasses } from "@/app/components/ui/Button";

export function BrowseBackLink({ href, className = "mb-6" }: { href: string; className?: string }) {
  return (
    <Link href={href} className={buttonClasses({ variant: "secondary", size: "sm", hover: "hover", className })}>
      ← Back to results
    </Link>
  );
}

export function BrowseNotFound({ title, message, backHref }: { title: string; message: string; backHref: string }) {
  return (
    <div className="px-5 py-15 text-center text-text-muted">
      <h3 className="mb-2 text-[1.15rem] text-white">{title}</h3>
      <p>{message}</p>
      <BrowseBackLink href={backHref} className="mt-4" />
    </div>
  );
}
