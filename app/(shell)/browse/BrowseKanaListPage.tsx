"use client";

import { useMemo, useState, type ReactNode } from "react";
import { GOJUON_ROW_LABELS, GOJUON_ROW_LAYOUT, EXTENDED_KATAKANA_ROW_LABELS } from "@/lib/srs/gojuon";
import { BrowseTabs } from "./BrowseTabs";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { scrollWindowToTopOnFocus } from "@/lib/scrollFocus";
import { FaMagnifyingGlass } from "react-icons/fa6";
import type { BrowseKanaEntry, KanaRuleLabel } from "@/lib/types";

type KanaRow = BrowseKanaEntry;

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function matches(row: KanaRow, query: string): boolean {
  if (!query) return true;
  return row.character.includes(query) || normalize(row.romaji).includes(query);
}

function groupByRow(rows: KanaRow[]): [string, KanaRow[]][] {
  const byRow = new Map<string, KanaRow[]>();
  for (const row of rows) {
    const list = byRow.get(row.gojuon_row);
    if (list) list.push(row);
    else byRow.set(row.gojuon_row, [row]);
  }
  return Array.from(byRow.entries());
}

const TIER_LABELS: Partial<Record<BrowseKanaEntry["frequency_tier"], string>> = {
  rare: "rare",
  very_rare: "very rare",
};

const TIER_STYLES: Partial<Record<BrowseKanaEntry["frequency_tier"], string>> = {
  rare: "text-accent-blue bg-accent-blue/10",
  very_rare: "text-accent-gold bg-accent-gold/10",
};

/** Which kana_types fold into the "Sound Rules & Combinations" container -- a page-layout
 * decision, not data, so it stays in code. Their titles (and the display order among them) come
 * from public.kana_rule_labels instead (see labels prop, KanaRuleLabel, and sectionTitle below) --
 * per user request, since those labels are needed in other places beyond this page. */
const SOUND_RULE_KANA_TYPES = new Set<BrowseKanaEntry["kana_type"]>(["yoon", "sokuon", "n_gemination", "choonpu"]);

/** A section/subsection heading's Japanese technical term (Dakuten, Sokuon, ...) -- rendered
 * smaller, unbolded, and un-uppercased next to the friendly label so it reads as a footnote, not
 * the headline, regardless of which heading style it's embedded in (GojuonRowSection's bold white
 * h2, or RuleSubsection's small muted uppercase label). */
function TechnicalTerm({ term }: { term: string }) {
  return <span className="ml-1.5 text-[0.75rem] font-normal normal-case tracking-normal text-text-muted/70">({term})</span>;
}

/** Looks up a kana_type's label in the fetched kana_rule_labels list and renders "Label
 * (Technical)" -- returns null while labels are still loading (or on a kana_type not yet in the
 * table), which GojuonRowSection/RuleSubsection both already treat as "no title shown". */
function sectionTitle(labels: KanaRuleLabel[] | null, kanaType: BrowseKanaEntry["kana_type"]): ReactNode {
  const entry = labels?.find((l) => l.kana_type === kanaType);
  if (!entry) return null;
  return (
    <>
      {entry.label}
      <TechnicalTerm term={entry.technical_term} />
    </>
  );
}

interface Props {
  active: "hiragana" | "katakana";
  placeholder: string;
  accentClass: string;
  data: KanaRow[] | null;
  status: "loading" | "loaded" | "error";
  labels: KanaRuleLabel[] | null;
}

function KanaCard({ row, accentClass, showTier }: { row: KanaRow; accentClass: string; showTier?: boolean }) {
  const tierStyle = showTier ? TIER_STYLES[row.frequency_tier] : undefined;
  return (
    <div className="flex min-w-[84px] flex-col items-center gap-1 rounded-2xl border border-border-soft bg-bg-cards px-4 py-3.5 backdrop-blur-[10px]">
      <div className={`text-3xl ${accentClass}`}>{row.character}</div>
      <div className="text-[0.85rem] font-semibold text-text-muted">{row.romaji}</div>
      {tierStyle && (
        <span className={`rounded-full px-2 py-0.5 text-[0.6rem] font-bold uppercase tracking-wide ${tierStyle}`}>
          {TIER_LABELS[row.frequency_tier]}
        </span>
      )}
    </div>
  );
}

/** Notes use a tiny markdown-style convention -- `**text**` for emphasis -- since the column is
 * plain text, not rich text; this is the one place that convention gets parsed back into markup. */
function renderNotes(notes: string): ReactNode {
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

function RuleCard({ row, accentClass }: { row: KanaRow; accentClass: string }) {
  return (
    <div className="mb-3 flex items-start gap-4 rounded-2xl border border-border-soft bg-bg-cards px-5 py-4 backdrop-blur-[10px]">
      <div className={`shrink-0 text-3xl ${accentClass}`}>{row.character}</div>
      {row.notes && (
        <p className="whitespace-pre-line text-[0.85rem] leading-relaxed text-text-muted">{renderNotes(row.notes)}</p>
      )}
    </div>
  );
}

/** Renders one orthography rule as its explanatory card followed by its example grid -- rows come
 * pre-filtered to a single group (by kana_type or gojuon_row, depending on the caller) by the
 * caller. Returns null once search has filtered the group down to nothing. */
function RuleSubsection({ title, rows, accentClass }: { title: ReactNode; rows: KanaRow[]; accentClass: string }) {
  if (rows.length === 0) return null;
  const rule = rows.find((row) => row.entry_kind === "rule");
  const examples = rows.filter((row) => row.entry_kind === "example");
  return (
    <div>
      <div className="mb-2.5 text-[0.8rem] font-extrabold uppercase tracking-[1.2px] text-text-muted">{title}</div>
      {rule && <RuleCard row={rule} accentClass={accentClass} />}
      <div className="flex flex-wrap gap-2.5">
        {examples.map((row) => (
          <KanaCard key={row.id} row={row} accentClass={accentClass} />
        ))}
      </div>
    </div>
  );
}

/** Renders one or more gojuon-row groups (each its own small uppercase row label, e.g. "KA") under
 * an optional section title -- shared by the main seion grid and the Dakuten/Handakuten
 * subsections, which differ only in which rows they've been pre-filtered to and (for the latter
 * two) an explanatory rule row rendered ahead of the grid, same as RuleSubsection above. Returns
 * null once search has filtered the section down to nothing (rule included). */
function GojuonRowSection({
  title,
  rule,
  groups,
  accentClass,
}: {
  title?: ReactNode;
  rule?: KanaRow;
  groups: [string, KanaRow[]][];
  accentClass: string;
}) {
  if (groups.length === 0 && !rule) return null;
  return (
    <div>
      {title && <h2 className="mb-4 text-[1.05rem] font-bold text-white">{title}</h2>}
      {rule && <RuleCard row={rule} accentClass={accentClass} />}
      <div className="flex flex-col gap-6">
        {groups.map(([gojuonRow, rows]) => (
          <div key={gojuonRow}>
            <div className="mb-2.5 text-[0.8rem] font-extrabold uppercase tracking-[1.2px] text-text-muted">
              {GOJUON_ROW_LABELS[gojuonRow] ?? gojuonRow}
            </div>
            <div className="flex flex-wrap gap-2.5">
              {rows.map((row) => (
                <KanaCard key={row.id} row={row} accentClass={accentClass} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** One table per set (mirroring today's Kanji/Vocabulary "one tab = one page = one table"
 * pattern) -- but under 200 characters total per set, the whole thing loads once and this filters
 * it locally/instantly as the student types, rather than a server-side search RPC (not worth it
 * at this size -- see search_kanji/search_vocabulary for what that machinery looks like).
 *
 * Three sections, in order:
 *  1. The classical gojuon grid -- seion, then Dakuten and Handakuten as their own
 *     titled subsections, so voiced/semi-voiced forms don't blend into the base chart
 *     (20260822_kana_tables.sql for the rows, kana_type for the split).
 *  2. "Sound Rules & Combinations" -- sokuon/chōon/yōon/ん-gemination, each a rule card followed by
 *     its examples (20260903_kana_orthography_rules(_expansion).sql). Rendaku moved out to
 *     public.kanji_rules (20260829_kanji_rules_table.sql) -- it's a kanji-compound phenomenon, not
 *     a kana orthography rule. Particle reading (は/へ) was dropped outright per user request
 *     (20260829_drop_hiragana_particle_and_historical.sql).
 *  3. "Extended Katakana" -- katakana-only loanword combinations, grouped by consonant family with
 *     a rarity tag per card.
 * There used to be a fourth "Historical & Rare" section (ゐ/ゑ, ヰ/ヱ, iteration marks); dropped
 * outright, code and all, per user request once both tables' historical rows were gone
 * (20260829_drop_katakana_rare_extended_and_historical.sql).
 * A section (or subsection within it) is hidden entirely once search filters it down to nothing.
 *
 * Section/subsection titles ("Ten-Ten (Dakuten)", "Combined Sounds (Yōon)", ...) come from
 * public.kana_rule_labels (20260829_kana_rule_labels_table.sql), keyed by kana_type -- moved out
 * of hardcoded JSX per user request, since the same titles are needed elsewhere too. See
 * sectionTitle (real content) and BrowseKanaListSkeleton's comment (why its mirror is still
 * hardcoded). Which kana_types fold into "Sound Rules & Combinations" (vs. their own top-level
 * section) is still a page-layout decision made in code -- see SOUND_RULE_KANA_TYPES. */
export function BrowseKanaListPage({ active, placeholder, accentClass, data, status, labels }: Props) {
  const [search, setSearch] = useState("");
  const query = normalize(search);

  const partitioned = useMemo(() => {
    const rows = (data ?? []).filter((row) => matches(row, query));
    const seion = rows.filter((row) => row.entry_kind === "character" && row.kana_type === "seion");
    const seionRule = rows.find((row) => row.entry_kind === "rule" && row.kana_type === "seion");
    const dakuten = rows.filter((row) => row.entry_kind === "character" && row.kana_type === "dakuten");
    const handakuten = rows.filter((row) => row.entry_kind === "character" && row.kana_type === "handakuten");
    const dakutenRule = rows.find((row) => row.entry_kind === "rule" && row.kana_type === "dakuten");
    const handakutenRule = rows.find((row) => row.entry_kind === "rule" && row.kana_type === "handakuten");
    const extended = rows.filter((row) => row.entry_kind === "character" && row.kana_type === "extended");
    const extendedRule = rows.find((row) => row.entry_kind === "rule" && row.kana_type === "extended");
    const soundRules = rows.filter((row) => row.entry_kind !== "character" && row.kana_type !== "seion" && row.kana_type !== "dakuten" && row.kana_type !== "handakuten" && row.kana_type !== "extended");

    return {
      mainGroups: groupByRow(seion),
      seionRule,
      dakutenGroups: groupByRow(dakuten),
      handakutenGroups: groupByRow(handakuten),
      dakutenRule,
      handakutenRule,
      extendedGroups: groupByRow(extended),
      extendedRule,
      soundRuleSections: (labels ?? [])
        .filter((entry) => SOUND_RULE_KANA_TYPES.has(entry.kana_type))
        .map((entry) => ({
          key: entry.kana_type,
          title: (
            <>
              {entry.label}
              <TechnicalTerm term={entry.technical_term} />
            </>
          ),
          rows: soundRules.filter((row) => row.kana_type === entry.kana_type),
        })),
    };
  }, [data, query, labels]);

  const hasSoundRules = partitioned.soundRuleSections.some((section) => section.rows.length > 0);
  const isInitialLoading = status === "loading" && !data;
  const isEmpty =
    partitioned.mainGroups.length === 0 &&
    !partitioned.seionRule &&
    partitioned.dakutenGroups.length === 0 &&
    !partitioned.dakutenRule &&
    partitioned.handakutenGroups.length === 0 &&
    !partitioned.handakutenRule &&
    !hasSoundRules &&
    partitioned.extendedGroups.length === 0 &&
    !partitioned.extendedRule;

  return (
    <div>
      <BrowseTabs active={active} />

      <div className="mb-5.5 flex flex-wrap gap-3">
        <div className="flex min-w-2 flex-1 items-center gap-2.5 rounded-xl border border-border-soft bg-white/[0.03] px-4 py-3">
          <FaMagnifyingGlass className="h-4 w-4 shrink-0 text-text-muted" />
          <input
            type="text"
            className="min-w-[100px] flex-1 truncate bg-transparent text-[0.95rem] text-white outline-none placeholder:text-text-muted"
            placeholder={placeholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={scrollWindowToTopOnFocus}
          />
        </div>
      </div>

      {isInitialLoading ? (
        <BrowseKanaListSkeleton />
      ) : status === "error" && !data ? (
        <div className="px-5 py-15 text-center text-text-muted">
          <h3 className="mb-2 text-[1.15rem] text-white">Couldn&apos;t load the list</h3>
          <p>Try reloading the page.</p>
        </div>
      ) : isEmpty ? (
        <div className="px-5 py-15 text-center text-text-muted">
          <div className="mx-auto mb-4.5 flex h-15 w-15 items-center justify-center rounded-full border border-border-soft bg-white/[0.04] [&>svg]:h-6.5 [&>svg]:w-6.5">
            <FaMagnifyingGlass />
          </div>
          <h3 className="mb-2 text-[1.15rem] text-white">No results{search ? ` for "${search}"` : ""}</h3>
          <p>Try a different character or romaji.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          <GojuonRowSection rule={partitioned.seionRule} groups={partitioned.mainGroups} accentClass={accentClass} />
          <GojuonRowSection
            title={sectionTitle(labels, "dakuten")}
            rule={partitioned.dakutenRule}
            groups={partitioned.dakutenGroups}
            accentClass={accentClass}
          />
          <GojuonRowSection
            title={sectionTitle(labels, "handakuten")}
            rule={partitioned.handakutenRule}
            groups={partitioned.handakutenGroups}
            accentClass={accentClass}
          />

          {hasSoundRules && (
            <div>
              <h2 className="mb-4 text-[1.05rem] font-bold text-white">Sound Rules & Combinations</h2>
              <div className="flex flex-col gap-6">
                {partitioned.soundRuleSections.map(({ key, title, rows }) => (
                  <RuleSubsection key={key} title={title} rows={rows} accentClass={accentClass} />
                ))}
              </div>
            </div>
          )}

          {(partitioned.extendedGroups.length > 0 || partitioned.extendedRule) && (
            <div>
              <h2 className="mb-4 text-[1.05rem] font-bold text-white">{sectionTitle(labels, "extended")}</h2>
              {partitioned.extendedRule && <RuleCard row={partitioned.extendedRule} accentClass={accentClass} />}
              <div className="flex flex-col gap-6">
                {partitioned.extendedGroups.map(([gojuonRow, rows]) => (
                  <div key={gojuonRow}>
                    <div className="mb-2.5 text-[0.8rem] font-extrabold uppercase tracking-[1.2px] text-text-muted">
                      {EXTENDED_KATAKANA_ROW_LABELS[gojuonRow] ?? gojuonRow}
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      {rows.map((row) => (
                        <KanaCard key={row.id} row={row} accentClass={accentClass} showTier />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/** Mirrors one gojuon-row-grouped section of the skeleton -- same shape as GojuonRowSection's
 * loaded-state markup, but with placeholder cards instead of real ones. */
function KanaSkeletonSection({ title, layout }: { title?: ReactNode; layout: readonly { row: string; count: number }[] }) {
  return (
    <div>
      {title && <h2 className="mb-4 text-[1.05rem] font-bold text-white">{title}</h2>}
      <div className="flex flex-col gap-6">
        {layout.map(({ row, count }) => (
          <div key={row}>
            <div className="mb-2.5 text-[0.8rem] font-extrabold uppercase tracking-[1.2px] text-text-muted">
              {GOJUON_ROW_LABELS[row] ?? row}
            </div>
            <div className="flex flex-wrap gap-2.5">
              {Array.from({ length: count }).map((_, i) => (
                <div
                  key={i}
                  className="flex min-w-[84px] flex-col items-center gap-1 rounded-2xl border border-border-soft bg-bg-cards px-4 py-3.5 backdrop-blur-[10px]"
                >
                  <Skeleton className="h-9 w-8 rounded-md" />
                  <Skeleton className="h-3.5 w-7 rounded" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Mirrors the main grid exactly -- same gojuon-row groups (split into seion/Dakuten/Handakuten,
 * same as GojuonRowSection above), same card count per row, same card shell -- so only the
 * character/romaji text is a placeholder instead of the whole card. Safe to hardcode: seion/
 * dakuten/handakuten is a fixed, closed set, and GOJUON_ROW_LAYOUT's order (a..n, then ga/za/da/ba,
 * then pa) matches that split exactly (see GOJUON_ROW_LAYOUT). Deliberately doesn't try to mirror
 * Sound Rules/Extended Katakana -- they pop in once data loads instead. The Dakuten/Handakuten
 * titles are hardcoded here too (unlike the real GojuonRowSection calls, which look them up via
 * sectionTitle) -- this is rendered as the Suspense fallback, before any fetch (including
 * kana_rule_labels) has resolved, so there's no labels prop to read from yet. Keep these in sync
 * with public.kana_rule_labels by hand if either changes. */
export function BrowseKanaListSkeleton() {
  return (
    <div className="flex flex-col gap-8">
      <KanaSkeletonSection layout={GOJUON_ROW_LAYOUT.slice(0, 11)} />
      <KanaSkeletonSection
        title={
          <>
            Ten-Ten
            <TechnicalTerm term="Dakuten" />
          </>
        }
        layout={GOJUON_ROW_LAYOUT.slice(11, 15)}
      />
      <KanaSkeletonSection
        title={
          <>
            Maru
            <TechnicalTerm term="Handakuten" />
          </>
        }
        layout={GOJUON_ROW_LAYOUT.slice(15)}
      />
    </div>
  );
}
