"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  cachedCandidate,
  cachedKanjiRow,
  prefetchKanjiWordVocabulary,
  takeKanjiWordVocabulary,
} from "@/lib/client-data/adminKanjiWords";
import { fetchVocabularyReviews } from "@/lib/data/adminKanjiWords";
import { createClient } from "@/lib/supabase/client";
import { isMultiRegionEnabled } from "@/lib/supabase/regions";
import { Breadcrumbs } from "@/app/components/ui/Breadcrumbs";
import { FullScreenLoader } from "@/app/components/ui/FullScreenLoader";
import { PageHeader } from "@/app/components/ui/PageHeader";
import { kanjiWordHref, setTrailOpened, wordTrailFor } from "../kanjiWordsMemory";
import { useWordEditor, type LoadedWord } from "../useWordEditor";
import type { WordFallback } from "../WordEditor";
import { pageViewport, positiveId, useLeaveGuard, walkOf, WordPageEditor, WordPageNav } from "../WordPageParts";

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

function AdminKanjiWord() {
  const searchParams = useSearchParams();
  const kanjiWordId = positiveId(searchParams.get("kw"));
  const kanjiId = positiveId(searchParams.get("k"));
  const kanjiHref = kanjiId !== null ? `/admin/kanji-words?k=${kanjiId}` : "/admin/kanji-words";

  if (!isMultiRegionEnabled()) {
    return (
      <PageHeader
        breadcrumbs={[{ label: "Teacher", href: "/admin" }, { label: "Words per kanji", href: "/admin/kanji-words" }, { label: "Word" }]}
        title="Edit a word"
        subtitle="Editing words needs the EU/US projects (NEXT_PUBLIC_MULTI_REGION), which hold the word edit functions."
      />
    );
  }
  if (kanjiWordId === null) {
    return (
      <PageHeader
        breadcrumbs={[{ label: "Teacher", href: "/admin" }, { label: "Words per kanji", href: kanjiHref }, { label: "Word" }]}
        title="No word chosen"
        subtitle="Open a word from a kanji's panel with the pencil on its card."
      />
    );
  }
  // Another word (‹ ›) starts from scratch: its own draft, history and reviewed mark.
  return <KanjiWordPage key={kanjiWordId} kanjiWordId={kanjiWordId} kanjiId={kanjiId} />;
}

export default function AdminKanjiWordPage() {
  return (
    <Suspense fallback={<FullScreenLoader />}>
      <AdminKanjiWord />
    </Suspense>
  );
}
