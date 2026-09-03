"use client";

import { useState, type ReactNode } from "react";
import { FaChevronDown, FaTrophy } from "react-icons/fa6";
import { useUserAchievements } from "@/lib/client-data/achievements";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { AchievementCard, AchievementCardSkeleton, LockedAchievementCard } from "@/app/components/ui/AchievementCard";
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

  const orderedCategories = startedFirstByRecency(
    ACHIEVEMENT_CATEGORIES,
    (category) => category.subcategories.flatMap((subcategory) => subcategory.entries),
    earnedAt
  );

  // Precomputed once per render, top to bottom, so both the per-block open state and the
  // "is every block at this level collapsed" aggregate (which zeroes the gap between them, see
  // Collapsible usage below) come from the same numbers instead of being derived twice.
  const categoryStates = orderedCategories.map((category) => {
    const categoryEntries = category.subcategories.flatMap((subcategory) => subcategory.entries);
    const hasProgress = categoryEntries.some((entry) => earnedAt.has(entry.achievementKey));
    const open = status === "loading" || (toggledCategories.has(category.key) ? !hasProgress : hasProgress);

    const orderedSubcategories = startedFirstByRecency(
      category.subcategories,
      (subcategory) => subcategory.entries,
      earnedAt
    );
    const subcategoryStates = orderedSubcategories.map((subcategory) => {
      const subHasProgress = subcategory.entries.some((entry) => earnedAt.has(entry.achievementKey));
      const subId = subcategoryId(category, subcategory);
      const label = subcategoryLabel(subcategory);
      const toggledOpen = toggledSubcategories.has(subId) ? !subHasProgress : subHasProgress;
      // Only a subcategory with no header at all (see subcategoryLabel) has nothing to click to
      // collapse, so it always counts as "open" once the parent category is -- never independently
      // collapsed, so never why the gap should shrink to 0 either.
      const open = status === "loading" || label === undefined || toggledOpen;
      return { subcategory, subId, label, open };
    });

    return { category, categoryEntries, open, subcategoryStates };
  });
  const allCategoriesCollapsed = status === "loaded" && categoryStates.every((c) => !c.open);

  return (
    <GlassCard padding="lg">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="text-[1.05rem] font-bold text-white">Badges</h3>
        {status === "loaded" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-accent-gold to-accent-orange px-3 py-1 text-[0.8rem] font-extrabold text-black shadow-[0_0_16px_rgba(255,210,0,0.3)]">
            <FaTrophy className="text-[0.7rem]" />
            {totalEarned}/{ACHIEVEMENT_CATALOG.length}
          </span>
        ) : (
          <Skeleton className="h-[1.6rem] w-16 rounded-full" />
        )}
      </div>
      <div
        className={`flex flex-col transition-[gap] duration-300 ${allCategoriesCollapsed ? "gap-0" : "gap-6"}`}
      >
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
    </GlassCard>
  );
}
