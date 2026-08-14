import Link from "next/link";

export function BrowseTabs({ active }: { active: "kanji" | "vocabulary" }) {
  const tabClasses = (isActive: boolean) =>
    `cursor-pointer rounded-[9px] px-5 py-[9px] text-[0.88rem] font-bold ${
      isActive ? "bg-accent-red text-white" : "text-text-muted"
    }`;

  return (
    <div className="mb-5.5 flex justify-center md:block">
      <div className="inline-flex gap-1 rounded-xl border border-border-soft bg-white/[0.03] p-1">
        <Link href="/browse/kanji" prefetch={false} className={tabClasses(active === "kanji")}>
          Kanji
        </Link>
        <Link href="/browse/vocabulary" prefetch={false} className={tabClasses(active === "vocabulary")}>
          Vocabulary
        </Link>
      </div>
    </div>
  );
}
