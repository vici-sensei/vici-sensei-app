"use client";

import { Suspense, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FaArrowLeft, FaChevronLeft, FaChevronRight } from "react-icons/fa6";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  cachedCandidate,
  cachedKanjiRow,
  prefetchKanjiWordVocabulary,
  takeKanjiWordVocabulary,
} from "@/lib/client-data/adminKanjiWords";
import { useAllWords } from "@/lib/client-data/adminWords";
import { fetchVocabulary, fetchVocabularyReviews } from "@/lib/data/adminKanjiWords";
import { createClient } from "@/lib/supabase/client";
import { isMultiRegionEnabled } from "@/lib/supabase/regions";
import { Breadcrumbs } from "@/app/components/ui/Breadcrumbs";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { GlassCard } from "@/app/components/ui/GlassCard";
import { PageHeader } from "@/app/components/ui/PageHeader";
import { setTrailOpened, wordTrailFor } from "../../kanji-words/kanjiWordsMemory";
import { useWordEditor, type LoadedWord, type WordEditorState } from "../../kanji-words/useWordEditor";
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
} from "../../kanji-words/WordEditor";
import {
  entriesOf,
  listKeyOf,
  orderFor,
  pageOf,
  parseView,
  rememberOpened,
  rememberOrder,
  serializeView,
  visibleEntries,
  type WordsView,
} from "../wordsView";

/** The word's page, keeping the list's search, filters, sort and page in the URL for the way back and for ‹ ›. */
function editHref(id: number, view: WordsView): string {
  const qs = serializeView(view);
  return `/admin/words/edit?id=${id}${qs ? `&${qs}` : ""}`;
}

function listHref(view: WordsView): string {
  const qs = serializeView(view);
  return `/admin/words${qs ? `?${qs}` : ""}`;
}

/** A word opened from a kanji's panel on /admin/kanji-words (kw = its kanji_word id, k = the kanji). */
function kanjiWordHref(kanjiWordId: number, kanjiId: number | null): string {
  return `/admin/words/edit?kw=${kanjiWordId}${kanjiId !== null ? `&k=${kanjiId}` : ""}`;
}

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
interface Walk {
  index: number;
  count: number;
  prevId: number | null;
  nextId: number | null;
  go: (id: number) => void;
  prefetch?: (id: number) => void;
}

/** The way back, and ‹ › with the word's place in the walk. */
function WordPageNav({ backHref, backLabel, walk }: { backHref: string; backLabel: string; walk: Walk | null }) {
  const prefetch = walk?.prefetch;
  const prefetchOf = (to: number | null) => (prefetch && to !== null ? () => prefetch(to) : undefined);
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <Link href={backHref} className="inline-flex items-center gap-2 text-sm font-bold text-text-muted transition-colors hover:text-white">
        <FaArrowLeft className="h-3 w-3" />
        {backLabel}
      </Link>
      {walk ? (
        <div className="flex items-center gap-3 text-sm text-text-muted">
          <NavButton
            onClick={() => walk.prevId !== null && walk.go(walk.prevId)}
            onPrefetch={prefetchOf(walk.prevId)}
            disabled={walk.prevId === null}
            label="Previous word"
          >
            <FaChevronLeft className="h-3 w-3" />
          </NavButton>
          <span className="tabular-nums">
            {(walk.index + 1).toLocaleString()} of {walk.count.toLocaleString()}
          </span>
          <NavButton
            onClick={() => walk.nextId !== null && walk.go(walk.nextId)}
            onPrefetch={prefetchOf(walk.nextId)}
            disabled={walk.nextId === null}
            label="Next word"
          >
            <FaChevronRight className="h-3 w-3" />
          </NavButton>
        </div>
      ) : null}
    </div>
  );
}

/** ‹ › in an order of ids, from this one. */
function walkOf(order: number[] | null, id: number, go: (id: number) => void, prefetch?: (id: number) => void): Walk | null {
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
function useLeaveGuard(dirty: boolean, word: string | null) {
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
function pageViewport(bar: HTMLDivElement | null) {
  return {
    top: Math.max(0, document.querySelector("header")?.getBoundingClientRect().bottom ?? 0),
    bottom: bar?.getBoundingClientRect().top ?? window.innerHeight,
  };
}

/** The editor itself: two columns on a wide screen, then the bar with Save, History and the reviewed mark. */
function WordPageEditor({
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

/**
 * One word of /admin/words on its own page (the pencil on its row): the word editor that the kanji-words panel's
 * pencil opens too, with the meanings on the left and Reading + Usage on the right on a wide screen (one column
 * below that). Save, History and the reviewed mark sit in a bar stuck to the bottom of the screen; ‹ › walk through
 * the words in the list's order. Leaving with unsaved changes (a link, ‹ ›, closing the tab) asks first.
 */
function WordPage({ id, view }: { id: number; view: WordsView }) {
  const { user } = useAuth();
  const router = useRouter();
  // The list in memory (loaded now if the page was opened directly): the word's name before it loads, and ‹ ›.
  const { rows, reviews } = useAllWords(user);
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const editor = useWordEditor({
    wordKey: id,
    load: async (): Promise<LoadedWord> => {
      const supabase = createClient();
      const [vocabulary, marks] = await Promise.all([
        fetchVocabulary(supabase, id),
        // Without the marks the word can still be edited; the reviewed controls then stay as the list knew them.
        fetchVocabularyReviews(supabase, [id]).catch(() => null),
      ]);
      const mark = marks?.find((m) => m.id === id);
      return { vocabulary, reviewed: marks ? (mark ? { at: mark.at, by: mark.by } : null) : undefined };
    },
    initialReviewed: reviews ? (reviews.get(id) ?? null) : undefined,
    rootRef,
    // The page scrolls, not the card.
    viewport: () => pageViewport(barRef.current),
  });

  const cached = useMemo(() => rows?.find((row) => row.id === id) ?? null, [rows, id]);
  const fallback: WordFallback | null = cached ? { word: cached.word, furiganas: cached.furiganas, jlpt: cached.jlpt_level } : null;
  const word = editor.loaded?.word ?? cached?.word ?? null;

  // The list's order, as it was when this walk started (remembered by the list's pencil, or worked out here when the
  // page was opened directly), so a word a save takes out of the filters keeps its place.
  const listKey = listKeyOf(view);
  const order = useMemo(
    () => orderFor(listKey) ?? (rows ? visibleEntries(entriesOf(rows), view, reviews).map((e) => e.row.id) : null),
    [listKey, rows, reviews, view]
  );
  useEffect(() => {
    if (order && !orderFor(listKey)) rememberOrder(listKey, order);
  }, [order, listKey]);
  const index = order ? order.indexOf(id) : -1;
  // Back on the list, it opens on the page this word is on and lights up its row.
  const back = listHref(index >= 0 ? { ...view, page: pageOf(index) } : view);
  useEffect(() => {
    rememberOpened(id);
  }, [id]);

  function go(to: number) {
    if (editor.dirty && !window.confirm(`Drop your unsaved changes to ${word ?? "this word"}?`)) return;
    window.scrollTo({ top: 0, behavior: "instant" });
    // Replace, not push: Back goes to the list, not through every word seen on the way.
    router.replace(editHref(to, { ...view, page: pageOf(order!.indexOf(to)) }), { scroll: false });
  }

  useLeaveGuard(editor.dirty, word);

  return (
    <div>
      <Breadcrumbs items={[{ label: "Teacher", href: "/admin" }, { label: "All words", href: back }, { label: word ?? "Word" }]} />
      <WordPageNav backHref={back} backLabel="All words" walk={walkOf(order, id, go)} />
      <WordPageEditor editor={editor} fallback={fallback} rootRef={rootRef} barRef={barRef} />
    </div>
  );
}

/**
 * A word opened from a kanji's panel on /admin/kanji-words (the pencil on its card): the same editor, with the way
 * back to that kanji, where the panel is just as it was left (unsaved ticks included). ‹ › walk through the words the
 * panel showed, in its order. Every word's list isn't needed here, so it isn't downloaded: the heading and the
 * reviewed mark come from the kanji's candidates in memory, and the word itself was usually read ahead when the
 * pointer reached the pencil.
 */
function KanjiWordPage({ kanjiWordId, kanjiId }: { kanjiWordId: number; kanjiId: number | null }) {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  // Read once. Opened any other way than the panel's pencil in this tab (a reload, a link), they aren't known.
  const [trail] = useState(() => wordTrailFor(kanjiId));
  const [candidate] = useState(() => cachedCandidate(kanjiWordId));
  const [kanji] = useState(() => trail?.kanji ?? (kanjiId !== null ? (cachedKanjiRow(kanjiId)?.k ?? null) : null));
  // undefined: not known (a candidate from an RPC older than the marks, or none in memory), so the load reads it.
  const knownReviewed = candidate?.reviewed;

  const editor = useWordEditor({
    wordKey: kanjiWordId,
    load: async (): Promise<LoadedWord> => {
      const vocabulary = await takeKanjiWordVocabulary(kanjiWordId);
      if (knownReviewed !== undefined) return { vocabulary };
      const marks = await fetchVocabularyReviews(createClient(), [vocabulary.id]).catch(() => null);
      const mark = marks?.find((m) => m.id === vocabulary.id);
      return { vocabulary, reviewed: marks ? (mark ? { at: mark.at, by: mark.by } : null) : undefined };
    },
    initialReviewed: knownReviewed,
    rootRef,
    viewport: () => pageViewport(barRef.current),
  });

  const fallback: WordFallback | null = candidate ? { word: candidate.word, furiganas: candidate.furiganas, jlpt: candidate.jlpt } : null;
  const word = editor.loaded?.word ?? candidate?.word ?? null;
  const back = trail?.returnHref ?? (kanjiId !== null ? `/admin/kanji-words?k=${kanjiId}` : "/admin/kanji-words");

  function go(to: number) {
    if (editor.dirty && !window.confirm(`Drop your unsaved changes to ${word ?? "this word"}?`)) return;
    setTrailOpened(to);
    window.scrollTo({ top: 0, behavior: "instant" });
    // Replace, not push: Back goes to the kanji, not through every word seen on the way.
    router.replace(kanjiWordHref(to, kanjiId), { scroll: false });
  }
  const walk = walkOf(trail?.order ?? null, kanjiWordId, go, prefetchKanjiWordVocabulary);

  // Once this word is on screen, its neighbours are read ahead, so ‹ › show the next one at once.
  const loaded = editor.loaded !== null;
  const prevId = walk?.prevId ?? null;
  const nextId = walk?.nextId ?? null;
  useEffect(() => {
    if (!loaded) return;
    if (nextId !== null) prefetchKanjiWordVocabulary(nextId);
    if (prevId !== null) prefetchKanjiWordVocabulary(prevId);
  }, [loaded, prevId, nextId]);

  useLeaveGuard(editor.dirty, word);

  return (
    <div>
      <Breadcrumbs
        items={[
          { label: "Teacher", href: "/admin" },
          { label: "Words per kanji", href: kanji ? "/admin/kanji-words" : back },
          ...(kanji ? [{ label: kanji, href: back }] : []),
          { label: word ?? "Word" },
        ]}
      />
      <WordPageNav backHref={back} backLabel={kanji ? `Back to ${kanji}` : "Words per kanji"} walk={walk} />
      <WordPageEditor editor={editor} fallback={fallback} rootRef={rootRef} barRef={barRef} />
    </div>
  );
}

const positiveId = (value: string | null) => {
  const n = Number(value);
  return Number.isSafeInteger(n) && n > 0 ? n : null;
};

function AdminWordEdit() {
  const searchParams = useSearchParams();
  const id = positiveId(searchParams.get("id"));
  const kanjiWordId = positiveId(searchParams.get("kw"));
  const kanjiId = positiveId(searchParams.get("k"));
  const view = useMemo(() => parseView(new URLSearchParams(searchParams.toString())), [searchParams]);

  if (!isMultiRegionEnabled()) {
    return (
      <PageHeader
        breadcrumbs={[{ label: "Teacher", href: "/admin" }, { label: "All words", href: "/admin/words" }, { label: "Word" }]}
        title="Edit a word"
        subtitle="Editing words needs the EU/US projects (NEXT_PUBLIC_MULTI_REGION), which hold the word edit functions."
      />
    );
  }
  // Another word (‹ ›) starts from scratch: its own draft, history and reviewed mark.
  if (kanjiWordId !== null) return <KanjiWordPage key={kanjiWordId} kanjiWordId={kanjiWordId} kanjiId={kanjiId} />;
  if (id === null) {
    return (
      <PageHeader
        breadcrumbs={[{ label: "Teacher", href: "/admin" }, { label: "All words", href: listHref(view) }, { label: "Word" }]}
        title="No word chosen"
        subtitle={
          <>
            Open a word from{" "}
            <Link href={listHref(view)} className="font-bold text-accent-blue hover:underline">
              All words
            </Link>{" "}
            with the pencil on its row.
          </>
        }
      />
    );
  }
  return <WordPage key={id} id={id} view={view} />;
}

export default function AdminWordEditPage() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <AdminWordEdit />
    </Suspense>
  );
}
