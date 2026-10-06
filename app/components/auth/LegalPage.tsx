import type { ReactNode } from "react";
import Link from "next/link";
import { Logo } from "@/app/components/ui/Logo";

/** Shell for the plain-text legal pages (/terms, /privacy): readable column, logo links home. */
export function LegalPage({ title, updated, children }: { title: string; updated: string; children: ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[720px] px-6 py-10">
      <Link href="/login" aria-label="Back to Vici Sensei" className="mb-8 inline-block">
        <Logo size={56} />
      </Link>
      <h1 className="mb-1 text-[2rem] font-extrabold tracking-[-0.5px]">{title}</h1>
      <p className="mb-8 text-sm text-text-muted">Last updated {updated}</p>
      <div className="flex flex-col gap-4 text-[0.95rem] leading-[1.7] text-text-main/90 [&_h2]:mt-4 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-white [&_ul]:list-disc [&_ul]:pl-6 [&_li]:mb-1">
        {children}
      </div>
    </div>
  );
}

/** Public contact address shown on the Terms and Privacy pages. */
export const LEGAL_CONTACT = "vici.sensei@gmail.com";
