"use client";

import { useEffect, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { FaArrowLeft, FaChevronLeft, FaChevronRight } from "react-icons/fa6";
import { GlassCard } from "@/app/components/ui/GlassCard";
import type { WordEditorState } from "./useWordEditor";
import {
  WordDragExtras,
  WordFooter,
  WordHeading,
  WordHistoryView,
  WordLoadState,
  WordMeaningsFields,
  WordReadingGroup,
  WordUsageGroup,
  type WordFallback,
} from "./WordEditor";

/*
 * The word page's frame, shared by its two addresses: /admin/words/edit (a word of the list of every word) and
 * /admin/kanji-words/word (a word opened from a kanji's panel). Each page makes the editor (useWordEditor) with its own
 * load and puts these around it.
 */

function NavButton({
  onClick,
  onPrefetch,
  disabled,
  label,
  children,
}: {
  onClick: () => void;
  /** The pointer is on it: the word it goes to can be read ahead. */
  onPrefetch?: () => void;
  disabled: boolean;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onPointerEnter={onPrefetch}
      onFocus={onPrefetch}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl border border-border-soft bg-white/[0.03] text-text-muted transition-all hover:border-white/20 hover:text-white disabled:cursor-default disabled:opacity-40 disabled:hover:border-border-soft disabled:hover:text-text-muted"
    >
      {children}
    </button>
  );
}

/** Where ‹ › are in their walk, and where they go. */
export interface Walk {
  index: number;
  count: number;
  prevId: number | null;
  nextId: number | null;
  go: (id: number) => void;
  prefetch?: (id: number) => void;
}

/** ‹ › with the place in the walk between them; `noun` names what they step through ("word", "kanji"). */
export function WalkButtons({ walk, noun }: { walk: Walk; noun: string }) {
  const prefetch = walk.prefetch;
  const prefetchOf = (to: number | null) => (prefetch && to !== null ? () => prefetch(to) : undefined);
  return (
    <div className="flex items-center gap-3 text-sm text-text-muted">
      <NavButton
        onClick={() => walk.prevId !== null && walk.go(walk.prevId)}
        onPrefetch={prefetchOf(walk.prevId)}
        disabled={walk.prevId === null}
        label={`Previous ${noun}`}
      >
        <FaChevronLeft className="h-3 w-3" />
      </NavButton>
      {/* As wide as its widest ("12 of 12"), so › stays put from 9 to 10 and can be pressed again and again. */}
      <span className="grid text-center tabular-nums">
        <span className="invisible col-start-1 row-start-1">
          {walk.count.toLocaleString()} of {walk.count.toLocaleString()}
        </span>
        <span className="col-start-1 row-start-1">
          {(walk.index + 1).toLocaleString()} of {walk.count.toLocaleString()}
        </span>
      </span>
      <NavButton
        onClick={() => walk.nextId !== null && walk.go(walk.nextId)}
        onPrefetch={prefetchOf(walk.nextId)}
        disabled={walk.nextId === null}
        label={`Next ${noun}`}
      >
        <FaChevronRight className="h-3 w-3" />
      </NavButton>
    </div>
  );
}

/** The way back, and ‹ › with the word's place in the walk. */
export function WordPageNav({ backHref, backLabel, walk }: { backHref: string; backLabel: string; walk: Walk | null }) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <Link href={backHref} className="inline-flex items-center gap-2 text-sm font-bold text-text-muted transition-colors hover:text-white">
        <FaArrowLeft className="h-3 w-3" />
        {backLabel}
      </Link>
      {walk ? <WalkButtons walk={walk} noun="word" /> : null}
    </div>
  );
}

/** ‹ › in an order of ids, from this one. */
export function walkOf(order: number[] | null, id: number, go: (id: number) => void, prefetch?: (id: number) => void): Walk | null {
  const index = order ? order.indexOf(id) : -1;
  if (!order || index < 0) return null;
  return {
    index,
    count: order.length,
    prevId: index > 0 ? order[index - 1] : null,
    nextId: index < order.length - 1 ? order[index + 1] : null,
    go,
    prefetch,
  };
}

/**
 * Unsaved changes: a click on any link (this page's, the menu's) asks first, and so does closing or reloading the tab
 * (the browser's own question). The browser's Back button can't be asked about.
 */
export function useLeaveGuard(dirty: boolean, word: string | null) {
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    // Capture, on the document: before the link's own handler (Next's Link navigates from React's root listener).
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.target === "_blank") return;
      if (!window.confirm(`Drop your unsaved changes to ${word ?? "this word"}?`)) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClick, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClick, true);
    };
  }, [dirty, word]);
}

/** The part of the window a drag sees of the page: below the app's sticky header and above the bar. */
export function pageViewport(bar: HTMLDivElement | null) {
  return {
    top: Math.max(0, document.querySelector("header")?.getBoundingClientRect().bottom ?? 0),
    bottom: bar?.getBoundingClientRect().top ?? window.innerHeight,
  };
}

/** The editor itself: two columns on a wide screen, then the bar with Save, History and the reviewed mark. */
export function WordPageEditor({
  editor,
  fallback,
  rootRef,
  barRef,
}: {
  editor: WordEditorState;
  fallback: WordFallback | null;
  rootRef: RefObject<HTMLDivElement | null>;
  barRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      <GlassCard>
        <div ref={rootRef} className="text-left">
          {editor.view === "edit" ? (
            <div className="grid grid-cols-1 xl:grid-cols-2 xl:gap-x-12">
              <div className="min-w-0">
                {/* Over the top of the screen, under the app's header, while a meaning or a sense is dragged and S
                    and P are scrolled out of view. No height of its own: nothing moves when it shows. */}
                <div className="sticky top-[4.75rem] z-20 h-0">
                  <WordDragExtras editor={editor} dockClassName="absolute inset-x-0 top-0" />
                </div>
                <WordHeading editor={editor} fallback={fallback} id="word-title" as="h1" />
                <WordLoadState editor={editor} />
                <WordMeaningsFields editor={editor} />
              </div>
              <div className="min-w-0">
                <WordReadingGroup editor={editor} className="xl:mt-0 xl:border-t-0 xl:pt-0" />
                <WordUsageGroup editor={editor} />
              </div>
            </div>
          ) : (
            <>
              <WordHeading editor={editor} fallback={fallback} id="word-title" as="h1" />
              <WordHistoryView editor={editor} />
            </>
          )}
        </div>
      </GlassCard>

      {editor.draft ? (
        <div
          ref={barRef}
          className="sticky bottom-0 z-30 -mx-5 mt-4 border-t border-border-soft bg-bg-main/85 px-5 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] backdrop-blur-[12px]"
        >
          <WordFooter editor={editor} />
        </div>
      ) : null}
    </>
  );
}

/** A positive integer id from the URL, or null. */
export const positiveId = (value: string | null) => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};
