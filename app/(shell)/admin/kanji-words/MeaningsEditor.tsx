"use client";

import { Fragment, type PointerEvent } from "react";
import type { VocabularyEditable } from "@/lib/types";
import {
  blankItem,
  itemMoved,
  meaningPlaces,
  newId,
  placesOf,
  senseMoved,
  type DragLists,
  type DragSource,
  type Item,
} from "./meaningsDraft";
import { highlightOf, newSensePlaceholder, sensePlaceholder, type DragState } from "./useListDrag";
import { AddButton, CHANGED_OUTLINE, CHANGED_TAG, Grip, RemoveButton, TextList, dropRing } from "./wordEditorParts";
import { Tag } from "./WordMeanings";

type MeaningKey = "short_meaning" | "primary_meanings" | "other_meanings";

interface MeaningsEditorProps {
  lists: DragLists;
  /** The word as stored (cleaned): what is tinted as changed is compared with it. */
  stored: VocabularyEditable;
  changed: (key: MeaningKey) => boolean;
  onChange: (patch: Partial<DragLists>) => void;
  drag: DragState | null;
  startDrag: (e: PointerEvent<HTMLElement>, src: DragSource) => void;
}

/**
 * The meaning, right under the word, unlabelled: S, then P, then the secondary senses. A line that differs from what
 * is stored has its tag tinted, like a field's label. Every meaning has a handle to drag it within its list or to
 * another one (S, P, a sense, a new sense between two senses); a sense has one to move it among the senses or onto
 * P. A meaning that is in more than one place gets a red dot.
 */
export function MeaningsEditor({ lists, stored, changed, onChange, drag, startDrag }: MeaningsEditorProps) {
  const places = placesOf(lists);
  const dups = meaningPlaces(lists);
  const moved = (item: Item) => itemMoved(lists, places, item);
  const alsoIn = (own: string) => (item: Item) =>
    dups.get(item.text.trim().toLowerCase())?.filter((place) => place !== own) ?? null;
  const highlight = highlightOf(drag);
  const ring = (key: string) => (highlight?.key === key ? dropRing(highlight.bad) : "");
  const senseAt = sensePlaceholder(drag);
  const newSenseAt = newSensePlaceholder(drag);
  // While a whole sense is dragged, each sense shrinks to one line, so a long list (立てる has 26) fits on screen.
  const folded = drag?.src.type === "sense";
  const short = lists.short_meaning;
  const shortAlso = short.text.trim() ? alsoIn("S")(short) : null;
  const shortRing = ring("S");
  const senses = lists.other_meanings;
  const storedSenses = stored.other_meanings ?? [];

  // The room between senses (none above the first). A meaning dropped on it, or on the top or bottom edge of a
  // sense, becomes a new sense there.
  const gap = (j: number) => (
    <div data-dnd-gap={j} className={`relative shrink-0 ${j === 0 ? "h-0" : "h-1.5"}`}>
      {newSenseAt === j ? (
        <div
          data-dnd-ph="over"
          aria-hidden
          className="absolute inset-x-0 top-1/2 z-10 flex h-8 -translate-y-1/2 items-center truncate rounded-lg border-[1.5px] border-dashed border-accent-blue/70 bg-gray-950/90 px-2.5 text-xs font-bold text-accent-blue"
        >
          New sense: “{drag?.label}”
        </div>
      ) : null}
    </div>
  );
  const sensePlaceholderBox = (
    <div
      data-dnd-ph=""
      aria-hidden
      className="h-11 shrink-0 rounded-lg border-[1.5px] border-dashed border-accent-blue/60 bg-accent-blue/[0.07]"
    />
  );

  return (
    <div className="mt-1 space-y-2 text-sm">
      <div data-dnd-zone="S" className="flex items-center gap-1.5">
        <Tag title="Short meaning" className={changed("short_meaning") ? CHANGED_TAG : undefined}>
          S
        </Tag>
        {/* On the gold a violet border doesn't read: the outline the level badge gets instead. Its colour is set even
            while there is no outline, or transition-colors fades it in from the gold text colour. */}
        <span
          data-dnd-key={short.id}
          className={`flex min-w-0 flex-1 items-center rounded-md border border-accent-gold/30 bg-accent-gold/10 transition-colors focus-within:border-accent-gold/60 ${
            shortRing || `outline-accent-violet/60 ${changed("short_meaning") ? CHANGED_OUTLINE : "outline-none"}`
          } ${drag?.src.id === short.id ? "opacity-30" : ""}`}
        >
          <Grip
            disabled={!short.text.trim()}
            onPointerDown={(e) => startDrag(e, { type: "item", id: short.id, loc: { list: "S", s: 0, i: 0 } })}
          />
          <input
            value={short.text}
            onChange={(e) => onChange({ short_meaning: { ...short, text: e.target.value } })}
            placeholder="Short meaning (optional)"
            aria-label="Short meaning"
            className="min-w-0 flex-1 bg-transparent py-1 pl-0.5 pr-2 font-bold text-accent-gold outline-none placeholder:font-normal placeholder:text-accent-gold/50"
          />
          {shortAlso ? (
            <span
              title={`Also in ${shortAlso.join(", ")}`}
              aria-label={`Also in ${shortAlso.join(", ")}`}
              className="mr-2 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-red"
            />
          ) : null}
        </span>
      </div>

      <div data-dnd-zone="P" className="flex items-start gap-1.5">
        <span className="mt-1.5 flex">
          <Tag title="Primary meanings" className={changed("primary_meanings") ? CHANGED_TAG : undefined}>
            P
          </Tag>
        </span>
        <div className={`min-w-0 flex-1 rounded-lg ${ring("P")}`}>
          <TextList
            items={lists.primary_meanings}
            stored={stored.primary_meanings ?? []}
            onChange={(next) => onChange({ primary_meanings: next })}
            label="Primary meaning"
            addLabel="Meaning"
            dnd={{ list: "P", s: 0, drag, startDrag, moved, alsoIn: alsoIn("P") }}
          />
        </div>
      </div>

      <div data-dnd-zone="O" className="flex items-start gap-1.5">
        <span className="mt-1.5 flex">
          <Tag title="Secondary meanings" className={changed("other_meanings") ? CHANGED_TAG : undefined}>
            2nd
          </Tag>
        </span>
        <div data-dnd-senses="" className="flex min-w-0 flex-1 flex-col">
          {senses.map((sense, i) => {
            const texts = sense.items.map((item) => item.text.trim()).filter(Boolean);
            // A sense that isn't one of the stored senses (new, or edited) is tinted, and so is one moved by
            // dragging; inside it, so is each meaning that no stored sense has, or that was moved.
            const tinted =
              (texts.length > 0 && !storedSenses.some((s) => JSON.stringify(s) === JSON.stringify(texts))) ||
              senseMoved(lists, sense, i);
            return (
              <Fragment key={sense.id}>
                {gap(i)}
                {senseAt === i ? (
                  <>
                    {sensePlaceholderBox}
                    <div className="h-1.5 shrink-0" />
                  </>
                ) : null}
                <div
                  data-dnd-key={sense.id}
                  data-dnd-sense={i}
                  className={`flex items-start gap-1.5 rounded-lg border p-1.5 ${tinted ? "border-accent-violet/50" : "border-border-soft"} ${
                    drag?.src.id === sense.id ? "hidden" : ""
                  } ${ring(`O:${i}`)}`}
                >
                  <span className="flex h-7 shrink-0 items-center">
                    <Grip onPointerDown={(e) => startDrag(e, { type: "sense", id: sense.id, s: i })} />
                    <span className="w-4 text-right text-xs text-text-muted">{i + 1}</span>
                  </span>
                  <div className="min-w-0 flex-1">
                    <TextList
                      items={sense.items}
                      stored={storedSenses.flat()}
                      onChange={(next) =>
                        onChange({ other_meanings: senses.map((other, j) => (j === i ? { ...other, items: next } : other)) })
                      }
                      label={`Sense ${i + 1} meaning`}
                      addLabel="Meaning"
                      dnd={{ list: "O", s: i, drag, startDrag, moved, alsoIn: alsoIn(`2nd·${i + 1}`), folded }}
                    />
                  </div>
                  {folded ? null : (
                    <RemoveButton
                      label={`Remove secondary sense ${i + 1}`}
                      onClick={() => onChange({ other_meanings: senses.filter((_, j) => j !== i) })}
                    />
                  )}
                </div>
              </Fragment>
            );
          })}
          {senseAt === senses.length ? (
            <>
              <div className="h-1.5 shrink-0" />
              {sensePlaceholderBox}
            </>
          ) : null}
          {/* Below the last sense: a meaning dropped here (or on "+ Sense") becomes a new sense at the end. */}
          {gap(senses.length)}
          <div data-dnd-zone="newSense" className="self-start">
            <AddButton
              onClick={() => onChange({ other_meanings: [...senses, { id: newId(), home: -1, items: [blankItem()] }] })}
            >
              Sense
            </AddButton>
          </div>
        </div>
      </div>
    </div>
  );
}
