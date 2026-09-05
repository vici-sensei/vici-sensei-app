"use client";

import { useState, type ReactNode } from "react";
import { FaChevronDown, FaListUl, FaTrophy } from "react-icons/fa6";
import { useUserAchievements } from "@/lib/client-data/achievements";
import { GlassCard } from "@/app/components/ui/GlassCard";
import {
  AchievementCard,
  AchievementCardSkeleton,
  GridBadgeIcon,
  LockedAchievementCard,
} from "@/app/components/ui/AchievementCard";
import { Skeleton } from "@/app/components/ui/Skeleton";
import {
  ACHIEVEMENT_CATALOG,
  ACHIEVEMENT_CATEGORIES,
  type AchievementCatalogEntry,
  type AchievementCategory,
  type AchievementSubcategory,
} from "@/lib/achievements/registry";

/** Latest earned_at among a group's entries, or -Infinity if none of them are earned yet -- lets
 * groups with no progress sort last without a special case in the comparator. */
function mostRecentEarnedAt(entries: AchievementCatalogEntry[], earnedAt: Map<string, string>): number {
  let latest = -Infinity;
  for (const entry of entries) {
    const t = earnedAt.get(entry.achievementKey);
    if (t) latest = Math.max(latest, Date.parse(t));
  }
  return latest;
}

/** Groups (categories, or subcategories within one) with >=1 earned entry first, most-recent
 * activity in that group first -- so a group you just made progress in jumps back to the top,
 * same "freshest first" idea as earnedFirstByRecency below, just one level up. Groups with no
 * progress keep their original relative order at the back (there's no timestamp to sort them by). */
function startedFirstByRecency<T>(
  items: T[],
  entriesOf: (item: T) => AchievementCatalogEntry[],
  earnedAt: Map<string, string>
): T[] {
  const started: T[] = [];
  const notStarted: T[] = [];
  for (const item of items) {
    (entriesOf(item).some((entry) => earnedAt.has(entry.achievementKey)) ? started : notStarted).push(item);
  }
  started.sort((a, b) => mostRecentEarnedAt(entriesOf(b), earnedAt) - mostRecentEarnedAt(entriesOf(a), earnedAt));
  return [...started, ...notStarted];
}

/** Within one subcategory's entries: earned badges first, most-recently-earned first (a fresh
 * unlock always surfaces at the very top), locked badges after in their original catalog order. */
function earnedFirstByRecency(
  entries: AchievementCatalogEntry[],
  earnedAt: Map<string, string>
): AchievementCatalogEntry[] {
  const earned = entries.filter((entry) => earnedAt.has(entry.achievementKey));
  const locked = entries.filter((entry) => !earnedAt.has(entry.achievementKey));
  earned.sort((a, b) => Date.parse(earnedAt.get(b.achievementKey)!) - Date.parse(earnedAt.get(a.achievementKey)!));
  return [...earned, ...locked];
}

/** Globally-unique id for one subcategory -- subcategory labels repeat across categories (e.g.
 * "Overall" under both Hiragana and Katakana), so the category key has to be part of the key used
 * to track its collapsed/expanded state. */
function subcategoryId(category: AchievementCategory, subcategory: AchievementSubcategory): string {
  return `${category.key}:${subcategory.label ?? subcategory.entries[0].achievementKey}`;
}

/** Header text for a subcategory -- its own label, or, when it wasn't given one and happens to
 * hold exactly one achievement (Kana's "All Kana", the capstone group at the end of
 * Hiragana/Katakana), that single entry's own title. Makes every single-badge subcategory
 * independently collapsible without needing a made-up label that would just repeat the one card
 * inside it under a different name. undefined only for a genuinely unlabeled *multi*-entry
 * subcategory (JLPT Levels' one group) -- that one has no natural single title to borrow, so it
 * stays headerless and keeps following its parent category's open state. */
function subcategoryLabel(subcategory: AchievementSubcategory): string | undefined {
  if (subcategory.label) return subcategory.label;
  if (subcategory.entries.length === 1) return subcategory.entries[0].title;
  return undefined;
}

function toggleInSet(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function Chevron({ open }: { open: boolean }) {
  return (
    <FaChevronDown
      className={`shrink-0 text-[0.65rem] transition-transform duration-200 ${open ? "" : "-rotate-90"}`}
    />
  );
}

/** f7:circle-grid-3x3-fill -- not in react-icons (no Framework7 Icons package installed), so
 * inlined directly rather than pulling in a whole icon-fetching dependency for one icon. Fits the
 * grid-view toggle better than a square-cells glyph anyway, since every badge in that grid is
 * itself a circle. Path from https://api.iconify.design/f7/circle-grid-3x3-fill.svg (MIT,
 * Framework7 Icons). */
function GridCircleIcon({ className = "" }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="1em"
      height="1em"
      viewBox="0 0 56 56"
      fill="currentColor"
      className={className}
    >
      <path d="M28 18.86c3.703 0 6.75-3.047 6.75-6.75c0-3.704-3.047-6.75-6.75-6.727s-6.75 3.023-6.75 6.726c0 3.704 3.047 6.75 6.75 6.75m17.016 0c3.68 0 6.726-3.047 6.726-6.75c0-3.704-3.047-6.75-6.726-6.727c-3.703.023-6.75 3.023-6.75 6.726c0 3.704 3.047 6.75 6.75 6.75m-34.008-.024c3.68 0 6.726-3.023 6.726-6.703s-3.047-6.75-6.726-6.75c-3.703 0-6.75 3.07-6.75 6.75s3.047 6.703 6.75 6.703M28 34.75c3.703 0 6.75-3.047 6.75-6.75c0-3.68-3.047-6.75-6.75-6.727c-3.703.024-6.75 3.047-6.75 6.727c0 3.703 3.047 6.75 6.75 6.75m-16.992 0c3.68 0 6.726-3.047 6.726-6.75c0-3.68-3.047-6.75-6.726-6.727c-3.703.024-6.75 3.047-6.75 6.727c0 3.703 3.047 6.75 6.75 6.75m34.008 0c3.68 0 6.726-3.047 6.726-6.75c0-3.68-3.047-6.75-6.726-6.727c-3.703.024-6.75 3.047-6.75 6.727c0 3.703 3.047 6.75 6.75 6.75M11.008 50.64c3.68 0 6.726-3.046 6.726-6.75c0-3.68-3.047-6.726-6.726-6.726c-3.703 0-6.75 3.047-6.75 6.727c0 3.703 3.047 6.75 6.75 6.75m16.992 0c3.703 0 6.75-3.046 6.75-6.75c0-3.68-3.047-6.726-6.75-6.726s-6.75 3.047-6.75 6.727c0 3.703 3.047 6.75 6.75 6.75m17.016 0c3.68 0 6.726-3.046 6.726-6.75c0-3.68-3.047-6.726-6.726-6.726c-3.703 0-6.75 3.047-6.75 6.727c0 3.703 3.047 6.75 6.75 6.75" />
    </svg>
  );
}

/** Animated expand/contract + fade for one collapsible block -- the classic CSS-only
 * grid-template-rows "0fr to 1fr" trick, which animates smoothly to/from the content's natural
 * height without any JS measuring (unlike a max-height transition, it's exact regardless of how
 * tall the content actually is). Paired with an opacity fade on the inner wrapper so content
 * doesn't just get clipped away -- it fades out as it contracts and fades in as it expands.
 * Content stays mounted at all times (never conditionally rendered), which is what makes both
 * directions of the transition possible in the first place. */
function Collapsible({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div
      className="grid transition-[grid-template-rows] duration-300 ease-in-out"
      style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
    >
      <div
        className={`min-h-0 overflow-hidden transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
      >
        {children}
      </div>
    </div>
  );
}

export function BadgesSection({ userId }: { userId: string }) {
  const { data: achievements, status } = useUserAchievements(userId);
  const earnedAt = new Map(achievements?.map((achievement) => [achievement.achievement_key, achievement.earned_at]));
  const totalEarned = ACHIEVEMENT_CATALOG.filter((entry) => earnedAt.has(entry.achievementKey)).length;

  // Tracks only which groups the user has manually flipped away from their default -- the default
  // itself (open iff the group has >=1 earned badge) is recomputed from earnedAt every render, so
  // a fresh unlock can open a previously-empty, still-untouched group without needing an effect to
  // "initialize" state once data loads.
  const [toggledCategories, setToggledCategories] = useState<Set<string>>(new Set());
  const [toggledSubcategories, setToggledSubcategories] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"list" | "grid">("list");

  const orderedCategories = startedFirstByRecency(
    ACHIEVEMENT_CATEGORIES,
    (category) => category.subcategories.flatMap((subcategory) => subcategory.entries),
    earnedAt
  );

  // A brand new account has nothing earned anywhere, which by the rule above would collapse
  // every single category -- a wall of headers with nothing to click into. In that one case, the
  // very first subcategory of the very first category defaults open too, so there's always
  // something to see on first load instead of an all-collapsed dead end.
  const noProgressAtAll = status === "loaded" && totalEarned === 0;

  // Precomputed once per render, top to bottom, so both the per-block open state and the
  // "is every block at this level collapsed" aggregate (which zeroes the gap between them, see
  // Collapsible usage below) come from the same numbers instead of being derived twice.
  const categoryStates = orderedCategories.map((category, categoryIndex) => {
    const categoryEntries = category.subcategories.flatMap((subcategory) => subcategory.entries);
    const hasProgress = categoryEntries.some((entry) => earnedAt.has(entry.achievementKey));
    const openDefault = hasProgress || (noProgressAtAll && categoryIndex === 0);
    const open = status === "loading" || (toggledCategories.has(category.key) ? !openDefault : openDefault);

    const orderedSubcategories = startedFirstByRecency(
      category.subcategories,
      (subcategory) => subcategory.entries,
      earnedAt
    );
    const subcategoryStates = orderedSubcategories.map((subcategory, subIndex) => {
      const subHasProgress = subcategory.entries.some((entry) => earnedAt.has(entry.achievementKey));
      const subId = subcategoryId(category, subcategory);
      const label = subcategoryLabel(subcategory);
      const subOpenDefault = subHasProgress || (noProgressAtAll && categoryIndex === 0 && subIndex === 0);
      const toggledOpen = toggledSubcategories.has(subId) ? !subOpenDefault : subOpenDefault;
      // Only a subcategory with no header at all (see subcategoryLabel) has nothing to click to
      // collapse, so it always counts as "open" once the parent category is -- never independently
      // collapsed, so never why the gap should shrink to 0 either.
      const open = status === "loading" || label === undefined || toggledOpen;
      return { subcategory, subId, label, open };
    });

    return { category, categoryEntries, open, subcategoryStates };
  });
  const allCategoriesCollapsed = status === "loaded" && categoryStates.every((c) => !c.open);

  // Flattened, in the same "started/most-recent first" order as the list view -- used only by
  // the grid view below, which drops the category/subcategory grouping entirely but keeps the
  // same ordering so switching views doesn't reshuffle what's earned to the front.
  const gridEntries = categoryStates.flatMap(({ subcategoryStates }) =>
    subcategoryStates.flatMap(({ subcategory }) =>
      earnedFirstByRecency(subcategory.entries, earnedAt).map((entry) => ({
        entry,
        earned: earnedAt.has(entry.achievementKey),
      }))
    )
  );

  return (
    <GlassCard padding="lg">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-[1.05rem] font-bold text-white">Badges</h3>
        <div className="flex items-center gap-2">
          {status === "loaded" ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-accent-gold to-accent-orange px-3 py-1 text-[0.8rem] font-extrabold text-black shadow-[0_0_16px_rgba(255,210,0,0.3)]">
              <FaTrophy className="text-[0.7rem]" />
              {totalEarned}/{ACHIEVEMENT_CATALOG.length}
            </span>
          ) : (
            <Skeleton className="h-[1.6rem] w-16 rounded-full" />
          )}
          <button
            type="button"
            disabled={status === "loading"}
            onClick={() => setViewMode((mode) => (mode === "list" ? "grid" : "list"))}
            aria-label={viewMode === "list" ? "Switch to grid view" : "Switch to list view"}
            aria-pressed={viewMode === "grid"}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-border-soft text-2xl text-text-muted transition-colors hover:text-white disabled:cursor-default"
          >
            {viewMode === "list" ? <GridCircleIcon /> : <FaListUl />}
          </button>
        </div>
      </div>
      {viewMode === "grid" ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(2.75rem,1fr))] gap-3">
          {gridEntries.map(({ entry, earned }) => (
            <div key={entry.achievementKey} className="relative flex items-center justify-center">
              <GridBadgeIcon entry={entry} earned={earned} />
            </div>
          ))}
        </div>
      ) : (
        <div className={`flex flex-col transition-[gap] duration-300 ${allCategoriesCollapsed ? "gap-0" : "gap-6"}`}>
          {categoryStates.map(({ category, categoryEntries, open: categoryOpen, subcategoryStates }) => {
            const allSubcategoriesCollapsed = status === "loaded" && subcategoryStates.every((s) => !s.open);

            return (
              <div key={category.key}>
                <button
                  type="button"
                  disabled={status === "loading"}
                  aria-expanded={categoryOpen}
                  onClick={() => setToggledCategories((prev) => toggleInSet(prev, category.key))}
                  className="mb-2.5 flex w-full items-baseline justify-between gap-2 text-left text-[0.8rem] font-extrabold uppercase tracking-[1.2px] text-text-muted transition-colors hover:text-white disabled:cursor-default"
                >
                  <span className="flex items-center gap-1.5">
                    <Chevron open={categoryOpen} />
                    {category.label}
                  </span>
                  {status === "loaded" && (
                    <span className="normal-case tracking-normal text-text-muted/70">
                      {categoryEntries.filter((entry) => earnedAt.has(entry.achievementKey)).length}/{categoryEntries.length}
                    </span>
                  )}
                </button>
                <Collapsible open={categoryOpen}>
                  <div
                    className={`ml-4 flex flex-col transition-[gap] duration-300 ${allSubcategoriesCollapsed ? "gap-0" : "gap-4"}`}
                  >
                    {subcategoryStates.map(({ subcategory, subId, label, open: subOpen }) => (
                      <div key={subId}>
                        {label !== undefined && (
                          <button
                            type="button"
                            disabled={status === "loading"}
                            aria-expanded={subOpen}
                            onClick={() => setToggledSubcategories((prev) => toggleInSet(prev, subId))}
                            className="mb-2 flex w-full items-baseline justify-between gap-2 text-left text-[0.72rem] font-semibold text-text-muted/80 transition-colors hover:text-white disabled:cursor-default"
                          >
                            <span className="flex items-center gap-1.5">
                              <Chevron open={subOpen} />
                              {label}
                            </span>
                            {status === "loaded" && (
                              <span className="text-text-muted/60">
                                {subcategory.entries.filter((entry) => earnedAt.has(entry.achievementKey)).length}/{subcategory.entries.length}
                              </span>
                            )}
                          </button>
                        )}
                        <Collapsible open={subOpen}>
                          <div className="flex flex-col gap-3">
                            {status === "loading"
                              ? subcategory.entries.map((entry) => <AchievementCardSkeleton key={entry.achievementKey} />)
                              : earnedFirstByRecency(subcategory.entries, earnedAt).map((entry) =>
                                  earnedAt.has(entry.achievementKey) ? (
                                    <AchievementCard key={entry.achievementKey} entry={entry} />
                                  ) : (
                                    <LockedAchievementCard key={entry.achievementKey} entry={entry} />
                                  )
                                )}
                          </div>
                        </Collapsible>
                      </div>
                    ))}
                  </div>
                </Collapsible>
              </div>
            );
          })}
        </div>
      )}
    </GlassCard>
  );
}
