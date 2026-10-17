"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useAllWords } from "@/lib/client-data/adminWords";
import { fetchVocabulary, fetchVocabularyReviews } from "@/lib/data/adminKanjiWords";
import { createClient } from "@/lib/supabase/client";
import { isMultiRegionEnabled } from "@/lib/supabase/regions";
import { Breadcrumbs } from "@/app/components/ui/Breadcrumbs";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { PageHeader } from "@/app/components/ui/PageHeader";
import { useWordEditor, type LoadedWord } from "../../kanji-words/useWordEditor";
import type { WordFallback } from "../../kanji-words/WordEditor";
import { pageViewport, positiveId, useLeaveGuard, walkOf, WordPageEditor, WordPageNav } from "../../kanji-words/WordPageParts";
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

/**
 * One word of /admin/words on its own page (the pencil on its row): the word editor that the kanji-words panel's
 * pencil opens too (at /admin/kanji-words/word), with the meanings on the left and Reading + Usage on the right on a wide screen (one column
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

function AdminWordEdit() {
  const searchParams = useSearchParams();
  const id = positiveId(searchParams.get("id"));
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
  // Another word (‹ ›) starts from scratch: its own draft, history and reviewed mark.
  return <WordPage key={id} id={id} view={view} />;
}

export default function AdminWordEditPage() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <AdminWordEdit />
    </Suspense>
  );
}
