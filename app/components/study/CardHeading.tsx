import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  /** Review cards use extrabold; intro cards use medium. */
  bold?: boolean;
  /** Leaves room above for furigana reading marks. */
  furigana?: boolean;
  /** Hides the answer via select-none before it's revealed. */
  masked?: boolean;
}

/** Shared large central kanji/word heading used by every card on /study. */
export function CardHeading({ children, furigana = false, masked = false }: Props) {
  const classes = [
    "mb-2 text-3xl leading-none",
    furigana && "pt-[0.6em]",
    masked && "select-none",
  ]
    .filter(Boolean)
    .join(" ");

  return <div className={classes}>{children}</div>;
}
