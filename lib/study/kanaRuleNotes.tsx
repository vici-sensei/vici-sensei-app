import type { ReactNode } from "react";

/** Rule notes (public.hiragana/public.katakana, entry_kind = 'rule') use a tiny markdown-style
 * convention -- `**text**` for emphasis -- since the column is plain text, not rich text. Shared
 * by Browse's RuleCard (app/(shell)/browse/BrowseKanaListPage.tsx) and the /study "new_rule" intro
 * card (NewKanaRuleIntroCard.tsx), the only two places that ever render this column. */
export function renderKanaRuleNotes(notes: string): ReactNode {
  return notes
    .split(/(\*\*[^*]+\*\*)/g)
    .map((part, i) =>
      part.startsWith("**") && part.endsWith("**") ? (
        <strong key={i} className="font-bold text-text-main">
          {part.slice(2, -2)}
        </strong>
      ) : (
        part
      )
    );
}
