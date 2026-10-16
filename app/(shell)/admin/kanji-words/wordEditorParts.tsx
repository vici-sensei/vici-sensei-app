"use client";

import { Fragment, useState, type PointerEvent, type ReactNode } from "react";
import { FaGripVertical, FaPlus, FaXmark } from "react-icons/fa6";
import { blankItem, type DragSource, type Item, type ListKey } from "./meaningsDraft";
import { listPlaceholder, type DragState } from "./useListDrag";

// What differs from the word as stored (an edit not saved yet) is tinted violet, a colour nothing else in the popup
// uses: blue is the focus, gold the short meaning, green the reviewed mark. A save or a discard clears it.
export const box = (changed: boolean) =>
  changed ? "border-accent-violet/50 bg-accent-violet/[0.08]" : "border-border-soft bg-white/[0.03]";
export const CHANGED_OUTLINE = "outline-2 outline-offset-2 outline-accent-violet/60";
export const CHANGED_TAG = "border-accent-violet/50 bg-accent-violet/15 text-accent-violet";
// The box a drag is over (blue), or one it can't be dropped in (red).
export const dropRing = (bad: boolean) =>
  bad
    ? "outline outline-[1.5px] outline-offset-[3px] outline-accent-red/75 bg-accent-red/[0.06]"
    : "outline outline-[1.5px] outline-offset-[3px] outline-accent-blue/60";

export function ChangedDot() {
  return <span aria-hidden className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-accent-violet" />;
}

export function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-dashed border-border-soft px-2 py-1 text-xs font-bold text-text-muted transition-colors hover:border-white/25 hover:text-white"
    >
      <FaPlus className="h-2.5 w-2.5" />
      {children}
    </button>
  );
}

export function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Remove"
      aria-label={label}
      className="flex h-7 w-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-text-muted transition-colors hover:text-white"
    >
      <FaXmark className="h-3 w-3" />
    </button>
  );
}

/**
 * The handle an entry or a sense is dragged by: a mouse presses and moves, a finger holds it ~300 ms first. Left out
 * of the keyboard and of screen readers (decided: no keyboard moving). `disabled` keeps its room without it working,
 * so an entry doesn't shift when its first letter is typed.
 */
export function Grip({ onPointerDown, disabled = false }: { onPointerDown: (e: PointerEvent<HTMLElement>) => void; disabled?: boolean }) {
  return (
    <span
      aria-hidden
      title={disabled ? undefined : "Drag to move (on a touch screen: hold, then drag)"}
      onPointerDown={disabled ? undefined : onPointerDown}
      className={`flex h-7 w-[18px] shrink-0 items-center justify-center rounded-[5px] text-text-muted/70 transition-colors ${
        disabled ? "invisible" : "cursor-grab touch-none select-none hover:bg-white/[0.06] hover:text-white"
      }`}
    >
      <FaGripVertical className="h-3 w-3" />
    </span>
  );
}

/** Where the dragged entry would land (or comes back to): its size, dashed. */
export function Placeholder({ width, height }: { width: number; height: number }) {
  return (
    <span
      data-dnd-ph=""
      aria-hidden
      style={{ width, height }}
      className="inline-block max-w-full shrink-0 rounded-lg border-[1.5px] border-dashed border-accent-blue/60 bg-accent-blue/[0.07]"
    />
  );
}

/**
 * Shortcut drop targets over the top of the popup while a meaning or a sense is dragged and S and P are scrolled out
 * of view (a long word, low in its senses): dropping on one of them needs no scrolling back up.
 */
export function DragDock({ drag }: { drag: DragState }) {
  const bad = drag.check?.status === "blocked";
  const target = (key: string, label: string) => (
    <span
      data-dnd-dock={key}
      className={`rounded-lg border px-2.5 py-1.5 text-xs font-bold transition-colors ${
        drag.target?.dock !== key
          ? "border-dashed border-accent-blue/45 bg-accent-blue/5 text-accent-blue"
          : bad
            ? "border-accent-red/70 bg-accent-red/10 text-accent-red"
            : "border-accent-blue bg-accent-blue/20 text-accent-blue"
      }`}
    >
      {label}
    </span>
  );
  return (
    <div
      data-dnd-dockbar=""
      className="absolute inset-x-6 top-4 z-10 flex flex-wrap items-center gap-1.5 rounded-xl border border-accent-blue/30 bg-gray-950/95 p-2 shadow-[0_12px_30px_rgba(0,0,0,0.55)]"
    >
      <span className="mr-1 text-[0.65rem] font-extrabold uppercase tracking-[1px] text-text-muted">Drop on</span>
      {drag.src.type === "sense" ? (
        <>
          {target("toP", "P")}
          {target("first", "First place")}
          {target("last", "Last place")}
        </>
      ) : (
        <>
          {target("S", "S")}
          {target("P0", "Start of P")}
          {target("Pn", "End of P")}
          {target("new", "New sense")}
        </>
      )}
    </div>
  );
}

/** How a list takes part in dragging. */
export interface ListDnd {
  list: Exclude<ListKey, "S">;
  /** The sense, for list "O". */
  s: number;
  drag: DragState | null;
  startDrag: (e: PointerEvent<HTMLElement>, src: DragSource) => void;
  /** The entry was moved by dragging: tinted like a changed one. */
  moved: (item: Item) => boolean;
  /** The other places a meaning is also in (S, P, 2nd·n), for a red dot; null when none. */
  alsoIn?: (item: Item) => string[] | null;
  /** While a whole sense is dragged, every sense shrinks to one line. */
  folded?: boolean;
}

/**
 * A list of short texts, each in its own input that grows with its text, side by side; × removes one, + adds one,
 * the handle drags one (to another place in the list, or for meanings to another list).
 */
export function TextList({
  items,
  stored,
  onChange,
  label,
  addLabel,
  dnd,
}: {
  items: Item[];
  /** The entries as stored: one that isn't among them (new or edited) is tinted, and so is one moved by dragging. */
  stored: string[];
  onChange: (next: Item[]) => void;
  /** Names one entry, for screen readers ("Primary meaning 2"). */
  label: string;
  addLabel: string;
  dnd: ListDnd;
}) {
  // Only an entry added by the + button takes the focus, not the ones there when the popup opened.
  const [added, setAdded] = useState(false);
  const { drag } = dnd;
  const ph = listPlaceholder(drag, dnd.list, dnd.s);
  const placeholder = drag ? <Placeholder width={drag.width} height={drag.height} /> : null;
  return (
    <div
      data-dnd-list={dnd.list}
      className={`flex items-center gap-1.5 ${
        dnd.folded ? "max-h-7 flex-nowrap overflow-hidden [mask-image:linear-gradient(90deg,#000_80%,transparent)]" : "flex-wrap"
      }`}
    >
      {items.map((item, i) => {
        const text = item.text.trim();
        const also = text ? dnd.alsoIn?.(item) : null;
        return (
          <Fragment key={item.id}>
            {ph === i ? placeholder : null}
            <span
              data-dnd-key={item.id}
              data-dnd-item=""
              data-dnd-idx={i}
              className={`inline-flex max-w-full shrink-0 items-center rounded-lg border transition-colors focus-within:border-accent-blue/40 ${box(
                (text !== "" && !stored.includes(text)) || dnd.moved(item)
              )} ${drag?.src.id === item.id ? "hidden" : ""}`}
            >
              <Grip
                disabled={!text}
                onPointerDown={(e) => dnd.startDrag(e, { type: "item", id: item.id, loc: { list: dnd.list, s: dnd.s, i } })}
              />
              <input
                value={item.text}
                onChange={(e) => onChange(items.map((other) => (other.id === item.id ? { ...other, text: e.target.value } : other)))}
                autoFocus={added && i === items.length - 1}
                aria-label={`${label} ${i + 1}`}
                className="min-w-[3rem] max-w-full bg-transparent py-1 pl-0.5 text-sm text-white outline-none [field-sizing:content]"
              />
              {also ? (
                <span
                  title={`Also in ${also.join(", ")}`}
                  aria-label={`Also in ${also.join(", ")}`}
                  className="ml-1 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-red"
                />
              ) : null}
              {dnd.folded ? null : (
                <RemoveButton
                  label={`Remove ${label.toLowerCase()} ${i + 1}`}
                  onClick={() => onChange(items.filter((other) => other.id !== item.id))}
                />
              )}
            </span>
          </Fragment>
        );
      })}
      {ph === items.length ? placeholder : null}
      {dnd.folded ? null : (
        <AddButton
          onClick={() => {
            setAdded(true);
            onChange([...items, blankItem()]);
          }}
        >
          {addLabel}
        </AddButton>
      )}
    </div>
  );
}
