import Link from "next/link";

export function BrowseTabs({ active }: { active: "kanji" | "vocabulary" }) {
  return (
    <div className="browse-tabs">
      <Link href="/browse/kanji" className={`browse-tab${active === "kanji" ? " active" : ""}`}>
        Kanji
      </Link>
      <Link href="/browse/vocabulary" className={`browse-tab${active === "vocabulary" ? " active" : ""}`}>
        Vocabulary
      </Link>
    </div>
  );
}
