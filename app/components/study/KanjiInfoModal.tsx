"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Modal } from "@/app/components/ui/Modal";
import { LevelBadge } from "@/app/components/ui/LevelBadge";
import { Skeleton } from "@/app/components/ui/Skeleton";
import { getKanjiInfo } from "@/lib/client-data/kanji";
import type { KanjiInfo } from "@/lib/types";

type LookupState = { status: "loading" } | { status: "ready"; info: KanjiInfo | null } | { status: "error" };

interface Props {
  kanji: string;
  onClose: () => void;
}

/** Quick look at one kanji (meaning + JLPT level), opened by long-pressing it in a "New kanji"
 * card's word list -- see NewKanjiIntroCard. Usually already resolved by the time it opens, since
 * the card prefetches every kanji in its word list (prefetchKanjiInfo) as soon as the words load. */
export function KanjiInfoModal({ kanji, onClose }: Props) {
  const [state, setState] = useState<LookupState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    getKanjiInfo(kanji).then(
      (info) => {
        if (!cancelled) setState({ status: "ready", info });
      },
      () => {
        if (!cancelled) setState({ status: "error" });
      }
    );
    return () => {
      cancelled = true;
    };
  }, [kanji]);

  // Portaled because the word list this opens from sits inside StudyCardShell, whose backdrop-blur
  // makes it the containing block for any position:fixed descendant -- rendered in place, the
  // Modal's backdrop would only cover the card instead of the whole screen.
  return createPortal(
    <Modal onClose={onClose} labelledBy="kanji-info-title" showCloseButton>
      <div className="text-center">
        <div id="kanji-info-title" className="mt-2 text-7xl leading-none text-white">
          {kanji}
        </div>

        {state.status === "loading" && (
          <>
            <Skeleton className="mx-auto mt-5 h-7 w-44" />
            <div className="mt-4 flex justify-center">
              <LevelBadge level={null} loading />
            </div>
          </>
        )}

        {state.status === "ready" && state.info && (
          <>
            <div className="mt-5 text-[1.3rem] font-bold text-white">{state.info.meanings?.join(", ")}</div>
            {state.info.level && (
              <div className="mt-4 flex justify-center">
                <LevelBadge level={state.info.level} />
              </div>
            )}
          </>
        )}

        {state.status === "ready" && !state.info && (
          <p className="mt-5 text-[0.9rem] text-text-muted">No details for this kanji yet.</p>
        )}

        {state.status === "error" && (
          <p className="mt-5 text-[0.9rem] text-text-muted">Couldn&apos;t load this kanji. Please try again.</p>
        )}
      </div>
    </Modal>,
    document.body
  );
}
