"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type Dispatch,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
  type SetStateAction,
} from "react";
import { checkMove, type DragLists, type DragSource, type DropTarget, type MoveCheck } from "./meaningsDraft";

/** A drag in progress, as the popup renders it. */
export interface DragState {
  src: DragSource;
  /** The dragged text (a sense: its meanings), for the "new sense" placeholder. */
  label: string;
  /** Size of the dragged entry, for the placeholder that keeps its place. */
  width: number;
  height: number;
  /** Where it would land; null over nothing (it would go back). */
  target: DropTarget | null;
  /** null with no target. */
  check: Exclude<MoveCheck, { status: "none" }> | null;
  /** The shortcut bar is showing (S and P are scrolled out of view). */
  dock: boolean;
}

interface Options {
  scrollRef: RefObject<HTMLElement | null>;
  lists: DragLists | null;
  enabled: boolean;
  /** Applies the move; returns an entry to flash (the one a dropped duplicate merged into). */
  onDrop: (src: DragSource, target: DropTarget) => string | null;
  /** A drop where it isn't allowed. */
  onBlocked: (reason: string) => void;
}

// A finger holds this long on a handle before the drag starts (a slip off the handle cancels it)...
const HOLD_MS = 300;
const HOLD_TOLERANCE_PX = 8;
// ...a mouse only has to move this far.
const MOUSE_START_PX = 4;
// Near the top or bottom edge of the scroll box this much, the box scrolls by itself, faster closer to the edge.
const EDGE_PX = 52;
const SHIFT_MS = 130;
const DROP_MS = 190;

const GHOST_STYLE: Partial<CSSStyleDeclaration> = {
  position: "fixed",
  left: "0",
  top: "0",
  zIndex: "400",
  pointerEvents: "none",
  maxWidth: "260px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
  padding: "2px 10px",
  borderRadius: "999px",
  border: "1px solid rgba(0, 210, 255, 0.6)",
  background: "rgba(0, 40, 52, 0.95)",
  color: "#d9f7ff",
  font: "700 12px/1.6 var(--font-sans), sans-serif",
  boxShadow: "0 6px 16px rgba(0, 0, 0, 0.4)",
};
const TIP_STYLE: Partial<CSSStyleDeclaration> = {
  position: "fixed",
  left: "0",
  top: "0",
  zIndex: "400",
  pointerEvents: "none",
  maxWidth: "280px",
  padding: "4px 9px",
  borderRadius: "8px",
  background: "#0b1220",
  font: "700 12px/1.4 var(--font-sans), sans-serif",
};
const TIP_OK = { border: "1px solid rgba(0, 210, 255, 0.4)", color: "#bff3ff" };
const TIP_BAD = { border: "1px solid rgba(255, 74, 90, 0.55)", color: "#ffb3bb" };

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function ghostText(lists: DragLists, src: DragSource): string {
  const text =
    src.type === "sense"
      ? `Sense ${src.s + 1}: ${lists.other_meanings[src.s].items.map((item) => item.text).join(", ")}`
      : src.loc.list === "S"
        ? lists.short_meaning.text
        : (src.loc.list === "P"
            ? lists.primary_meanings
            : src.loc.list === "O"
              ? lists.other_meanings[src.loc.s].items
              : src.loc.list === "R"
                ? lists.other_readings
                : lists.parts_of_speech)[src.loc.i].text;
  return text.trim();
}

/** The visible entries of a list, with their index in the list (a hidden one is the entry being dragged). */
function indexIn(list: Element | null, x: number, y: number): number {
  if (!list) return 0;
  const items = [...list.querySelectorAll<HTMLElement>(":scope > [data-dnd-item]")].filter((el) => el.offsetParent !== null);
  for (const el of items) {
    const r = el.getBoundingClientRect();
    // On an earlier row, or on this row left of the middle: before this entry.
    if (y < r.top - 3 || (y <= r.bottom + 3 && x < r.left + r.width / 2)) return Number(el.dataset.dndIdx);
  }
  return items.length ? Number(items[items.length - 1].dataset.dndIdx) + 1 : 0;
}

function playFlip(root: HTMLElement, rects: Map<string, DOMRect>, ms: number) {
  const deltas = new Map<HTMLElement, { x: number; y: number }>();
  root.querySelectorAll<HTMLElement>("[data-dnd-key]").forEach((el) => {
    const from = rects.get(el.dataset.dndKey ?? "");
    if (!from || el.offsetParent === null) return;
    const to = el.getBoundingClientRect();
    deltas.set(el, { x: from.left - to.left, y: from.top - to.top });
  });
  for (const [el, d] of deltas) {
    // An entry inside a sense that moves too only plays its own share of the movement.
    const parent = el.parentElement?.closest<HTMLElement>("[data-dnd-key]");
    const p = parent ? deltas.get(parent) : undefined;
    const x = d.x - (p?.x ?? 0);
    const y = d.y - (p?.y ?? 0);
    if (Math.abs(x) < 1 && Math.abs(y) < 1) continue;
    el.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: "none" }], {
      duration: ms,
      easing: "cubic-bezier(0.2, 0.8, 0.2, 1)",
    });
  }
}

interface Press {
  src: DragSource;
  x: number;
  y: number;
  lastX: number;
  lastY: number;
  touch: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

interface Live {
  src: DragSource;
  x: number;
  y: number;
  key: string;
  target: DropTarget | null;
  check: DragState["check"];
  dock: boolean;
  ghost: HTMLDivElement;
  tip: HTMLDivElement;
  style: HTMLStyleElement;
}

/**
 * The pointer side of dragging, outside React: the press (a mouse moves 4px, a finger holds 300 ms), the pill that
 * follows the pointer, working out the target under it, scrolling the popup near its edges, Escape. React only
 * gets the DragState to render (the placeholder, the highlighted box, the shortcut bar) and the drop.
 */
class DragEngine {
  private press: Press | null = null;
  private live: Live | null = null;
  private raf = 0;
  private flip: { rects: Map<string, DOMRect>; ms: number } | null = null;
  private flash: string | null = null;
  // While the entries slide after the placeholder moved, the target isn't worked out again (their boxes are moving).
  private settleUntil = 0;
  private settleTimer: ReturnType<typeof setTimeout> | null = null;
  // A sense's top when its drag started: the senses fold to one line each, and it's kept under the pointer.
  private anchor: number | null = null;

  constructor(
    private readonly opts: () => Options,
    private readonly setDrag: Dispatch<SetStateAction<DragState | null>>
  ) {}

  start(e: PointerEvent, src: DragSource) {
    if (!this.opts().enabled || e.button !== 0 || this.live || this.press) return;
    e.preventDefault();
    const touch = e.pointerType !== "mouse";
    this.press = {
      src,
      x: e.clientX,
      y: e.clientY,
      lastX: e.clientX,
      lastY: e.clientY,
      touch,
      timer: touch ? setTimeout(() => this.begin(), HOLD_MS) : null,
    };
    window.addEventListener("pointermove", this.onMove, { passive: false });
    window.addEventListener("pointerup", this.onUp);
    window.addEventListener("pointercancel", this.onCancel);
  }

  /** After every render of the popup: the slide of the entries that moved, the flash, the folded senses' scroll. */
  afterRender() {
    const root = this.opts().scrollRef.current;
    if (!root) return;
    if (this.anchor !== null && this.live) {
      const ph = root.querySelector('[data-dnd-ph=""]');
      if (ph) root.scrollTop += ph.getBoundingClientRect().top - this.anchor;
      this.anchor = null;
    }
    const flip = this.flip;
    this.flip = null;
    if (flip) {
      playFlip(root, flip.rects, flip.ms);
      this.settleUntil = performance.now() + flip.ms;
    }
    if (this.flash) {
      root.querySelector(`[data-dnd-key="${this.flash}"]`)?.animate(
        [{ boxShadow: "0 0 0 0 rgba(0, 210, 255, 0)" }, { boxShadow: "0 0 0 3px rgba(0, 210, 255, 0.7)" }, { boxShadow: "0 0 0 0 rgba(0, 210, 255, 0)" }],
        { duration: 450, iterations: 3 }
      );
      this.flash = null;
    }
  }

  destroy() {
    if (this.live) this.end();
    this.detach();
  }

  private onMove = (e: PointerEvent) => {
    const p = this.press;
    if (p) {
      p.lastX = e.clientX;
      p.lastY = e.clientY;
      const dist = Math.hypot(e.clientX - p.x, e.clientY - p.y);
      if (p.touch) {
        if (dist > HOLD_TOLERANCE_PX) this.detach();
        return;
      }
      if (dist < MOUSE_START_PX) return;
      this.begin();
    }
    const l = this.live;
    if (!l) return;
    e.preventDefault();
    l.x = e.clientX;
    l.y = e.clientY;
    this.track();
  };

  private onUp = (e: PointerEvent) => {
    const l = this.live;
    if (!l) {
      this.detach();
      return;
    }
    l.x = e.clientX;
    l.y = e.clientY;
    this.settleUntil = 0;
    this.track();
    this.finish(true);
  };

  private onCancel = () => {
    if (this.live) this.finish(false);
    else this.detach();
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.key !== "Escape" || !this.live) return;
    // Before the popup's own Escape handler, which would close it.
    e.preventDefault();
    e.stopImmediatePropagation();
    this.finish(false);
  };

  private onBlur = () => {
    if (this.live) this.finish(false);
  };

  private detach() {
    if (this.press?.timer) clearTimeout(this.press.timer);
    this.press = null;
    window.removeEventListener("pointermove", this.onMove);
    window.removeEventListener("pointerup", this.onUp);
    window.removeEventListener("pointercancel", this.onCancel);
  }

  private begin() {
    const p = this.press;
    if (!p) return;
    if (p.timer) clearTimeout(p.timer);
    p.timer = null;
    this.press = null;
    const { scrollRef, lists } = this.opts();
    const el = scrollRef.current?.querySelector<HTMLElement>(`[data-dnd-key="${p.src.id}"]`);
    if (!el || !lists) {
      this.detach();
      return;
    }
    const r = el.getBoundingClientRect();
    if (p.touch) navigator.vibrate?.(10);
    (document.activeElement as HTMLElement | null)?.blur?.();

    const label = ghostText(lists, p.src);
    const ghost = document.createElement("div");
    Object.assign(ghost.style, GHOST_STYLE);
    ghost.textContent = label.length > 32 ? `${label.slice(0, 31)}…` : label;
    const tip = document.createElement("div");
    Object.assign(tip.style, TIP_STYLE);
    tip.hidden = true;
    const style = document.createElement("style");
    style.textContent = "*{cursor:grabbing!important;user-select:none!important;-webkit-user-select:none!important}";
    document.head.append(style);
    document.body.append(ghost, tip);

    this.live = { src: p.src, x: p.lastX, y: p.lastY, key: "", target: null, check: null, dock: false, ghost, tip, style };
    this.anchor = p.src.type === "sense" ? r.top : null;
    window.addEventListener("keydown", this.onKey, true);
    window.addEventListener("blur", this.onBlur);
    this.setDrag({ src: p.src, label, width: r.width, height: r.height, target: null, check: null, dock: false });
    this.track();
    // Nothing slides when the drag starts: the placeholder takes the entry's place exactly.
    this.flip = null;
    this.raf = requestAnimationFrame(this.loop);
  }

  private capture(ms: number, override?: [string, DOMRect]) {
    const root = this.opts().scrollRef.current;
    if (!root || reducedMotion()) return;
    const rects = new Map<string, DOMRect>();
    root.querySelectorAll<HTMLElement>("[data-dnd-key]").forEach((el) => {
      if (el.offsetParent !== null) rects.set(el.dataset.dndKey ?? "", el.getBoundingClientRect());
    });
    if (override) rects.set(override[0], override[1]);
    this.flip = { rects, ms };
  }

  private track() {
    const l = this.live;
    if (!l) return;
    l.ghost.style.transform = `translate(${l.x + 14}px, ${l.y + 14}px)`;
    const wait = this.settleUntil - performance.now();
    if (wait > 0) {
      this.settleTimer ??= setTimeout(() => {
        this.settleTimer = null;
        this.track();
      }, wait + 10);
      return;
    }
    const lists = this.opts().lists;
    const target = lists ? this.hit(l.x, l.y) : null;
    const result = target && lists ? checkMove(lists, l.src, target) : null;
    const check = result && result.status !== "none" ? result : null;
    const t = check ? target : null;
    const key = JSON.stringify([t, check]);
    if (key !== l.key) {
      l.key = key;
      l.target = t;
      l.check = check;
      this.capture(SHIFT_MS);
      this.setDrag((d) => d && { ...d, target: t, check });
    }
    const text = check?.status === "blocked" ? check.reason : check?.status === "ok" ? check.note : "";
    l.tip.hidden = !text;
    if (text) {
      l.tip.textContent = text;
      Object.assign(l.tip.style, check?.status === "blocked" ? TIP_BAD : TIP_OK);
      const left = Math.max(8, Math.min(l.x + 14, window.innerWidth - l.tip.offsetWidth - 8));
      l.tip.style.transform = `translate(${left}px, ${l.y + 40}px)`;
    }
  }

  private loop = () => {
    const l = this.live;
    if (!l) return;
    this.raf = requestAnimationFrame(this.loop);
    const scroll = this.opts().scrollRef.current;
    if (!scroll) return;
    const box = scroll.getBoundingClientRect();
    const overDock = !!document.elementFromPoint(l.x, l.y)?.closest("[data-dnd-dockbar]");
    const meaning = l.src.type === "sense" || ["S", "P", "O"].includes(l.src.loc.list);
    const prow = scroll.querySelector('[data-dnd-zone="P"]');
    const dock = meaning && !!prow && (overDock || prow.getBoundingClientRect().bottom < box.top + 6);
    if (dock !== l.dock) {
      l.dock = dock;
      this.setDrag((d) => d && { ...d, dock });
    }
    if (overDock) return;
    const dockBar = dock ? document.querySelector("[data-dnd-dockbar]") : null;
    const top = Math.max(box.top, dockBar?.getBoundingClientRect().bottom ?? box.top);
    let p = 0;
    if (l.y < top + EDGE_PX && l.y > top - 60) p = -Math.min(1.4, (top + EDGE_PX - l.y) / EDGE_PX);
    else if (l.y > box.bottom - EDGE_PX && l.y < box.bottom + 60) p = Math.min(1.4, (l.y - (box.bottom - EDGE_PX)) / EDGE_PX);
    if (!p) return;
    const before = scroll.scrollTop;
    scroll.scrollTop += Math.sign(p) * (2 + 16 * p * p);
    if (scroll.scrollTop !== before) this.track();
  };

  private hit(x: number, y: number): DropTarget | null {
    const l = this.live;
    const root = this.opts().scrollRef.current;
    const lists = this.opts().lists;
    const el = document.elementFromPoint(x, y);
    if (!l || !root || !lists || !el) return null;
    const dockKey = el.closest<HTMLElement>("[data-dnd-dock]")?.dataset.dndDock;
    if (dockKey) return this.dockTarget(dockKey, lists);
    if (!root.contains(el)) return null;
    // Over the placeholder: where it already is.
    if (el.closest("[data-dnd-ph]")) return l.target;
    const src = l.src;
    if (src.type === "sense") return this.hitSense(el, y, root, lists);
    if (src.loc.list === "R" || src.loc.list === "POS") {
      const zone = el.closest(`[data-dnd-zone="${src.loc.list}"]`);
      return zone ? { kind: "item", list: src.loc.list, s: 0, i: indexIn(zone.querySelector("[data-dnd-list]"), x, y) } : null;
    }
    return this.hitMeaning(el, x, y, root, lists, false);
  }

  private hitMeaning(el: Element, x: number, y: number, root: HTMLElement, lists: DragLists, deep: boolean): DropTarget | null {
    if (el.closest('[data-dnd-zone="S"]')) return { kind: "S" };
    const sense = el.closest<HTMLElement>("[data-dnd-sense]");
    if (sense) {
      const s = Number(sense.dataset.dndSense);
      const r = sense.getBoundingClientRect();
      // The top and bottom edge of a sense: a new sense there.
      if (y < r.top + 8) return { kind: "newSense", s };
      if (y > r.bottom - 8) return { kind: "newSense", s: s + 1 };
      return { kind: "item", list: "O", s, i: indexIn(sense.querySelector("[data-dnd-list]"), x, y) };
    }
    const gap = el.closest<HTMLElement>("[data-dnd-gap]");
    if (gap) return { kind: "newSense", s: Number(gap.dataset.dndGap) };
    if (el.closest('[data-dnd-zone="newSense"]')) return { kind: "newSense", s: lists.other_meanings.length };
    const prow = el.closest('[data-dnd-zone="P"]');
    if (prow) return { kind: "item", list: "P", s: 0, i: indexIn(prow.querySelector("[data-dnd-list]"), x, y) };
    // Beside the senses (under the "2nd" tag): as if over the sense at that height.
    const senses = el.closest('[data-dnd-zone="O"]') ? root.querySelector("[data-dnd-senses]") : null;
    if (senses && !deep) {
      const c = senses.getBoundingClientRect();
      const x2 = Math.min(c.left + 24, c.right - 4);
      const el2 = document.elementFromPoint(x2, y);
      return el2 ? this.hitMeaning(el2, x2, y, root, lists, true) : null;
    }
    return null;
  }

  private hitSense(el: Element, y: number, root: HTMLElement, lists: DragLists): DropTarget | null {
    if (el.closest('[data-dnd-zone="P"]')) return { kind: "toP" };
    if (!el.closest('[data-dnd-zone="O"]')) return null;
    const senses = [...root.querySelectorAll<HTMLElement>("[data-dnd-sense]")].filter((s) => s.offsetParent !== null);
    for (const sense of senses) {
      const r = sense.getBoundingClientRect();
      const s = Number(sense.dataset.dndSense);
      if (y < r.top) return { kind: "senseGap", j: s };
      if (y <= r.bottom) return { kind: "senseGap", j: y < r.top + r.height / 2 ? s : s + 1 };
    }
    return { kind: "senseGap", j: lists.other_meanings.length };
  }

  private dockTarget(key: string, lists: DragLists): DropTarget | null {
    switch (key) {
      case "S":
        return { kind: "S", dock: key };
      case "P0":
        return { kind: "item", list: "P", s: 0, i: 0, dock: key };
      case "Pn":
        return { kind: "item", list: "P", s: 0, i: lists.primary_meanings.length, dock: key };
      case "new":
        return { kind: "newSense", s: lists.other_meanings.length, dock: key };
      case "toP":
        return { kind: "toP", dock: key };
      case "first":
        return { kind: "senseGap", j: 0, dock: key };
      case "last":
        return { kind: "senseGap", j: lists.other_meanings.length, dock: key };
    }
    return null;
  }

  private end() {
    const l = this.live;
    if (!l) return null;
    this.live = null;
    cancelAnimationFrame(this.raf);
    if (this.settleTimer) clearTimeout(this.settleTimer);
    this.settleTimer = null;
    this.settleUntil = 0;
    this.anchor = null;
    window.removeEventListener("keydown", this.onKey, true);
    window.removeEventListener("blur", this.onBlur);
    l.style.remove();
    l.tip.remove();
    return l;
  }

  private finish(drop: boolean) {
    this.detach();
    const l = this.end();
    if (!l) return;
    const { onDrop, onBlocked, scrollRef } = this.opts();
    if (drop && l.target && l.check?.status === "ok") {
      // The entry slides from where the pill was let go.
      const from = l.ghost.getBoundingClientRect();
      l.ghost.remove();
      this.capture(DROP_MS, l.src.type === "item" ? [l.src.id, from] : undefined);
      this.setDrag(null);
      this.flash = onDrop(l.src, l.target);
      return;
    }
    // Back to where it came from: the pill flies to the placeholder, which is where the entry reappears.
    const home = scrollRef.current?.querySelector('[data-dnd-ph=""]')?.getBoundingClientRect();
    if (home && !reducedMotion()) {
      const from = l.ghost.style.transform;
      l.ghost
        .animate([{ transform: from }, { transform: `translate(${home.left}px, ${home.top}px)` }], { duration: 170, easing: "ease-out" })
        .finished.then(() => l.ghost.remove(), () => l.ghost.remove());
    } else {
      l.ghost.remove();
    }
    this.setDrag(null);
    if (drop && l.check?.status === "blocked") onBlocked(l.check.reason);
  }
}

/**
 * Dragging in the word popup. Give every draggable entry and sense `data-dnd-key`, start a drag from a handle with
 * `startDrag`, and render from `drag`. The lists and boxes say what they are with `data-dnd-*` attributes (see
 * the hit testing in DragEngine): a list `data-dnd-list` with its entries `data-dnd-item` + `data-dnd-idx`, a sense
 * `data-dnd-sense`, the gaps between senses `data-dnd-gap`, the rows `data-dnd-zone` (S, P, O, newSense, R, POS),
 * the placeholder `data-dnd-ph`, the shortcut bar `data-dnd-dockbar` with its buttons `data-dnd-dock`.
 */
export function useListDrag(options: Options) {
  const [drag, setDrag] = useState<DragState | null>(null);
  const optionsRef = useRef(options);
  const engineRef = useRef<DragEngine | null>(null);
  useEffect(() => {
    optionsRef.current = options;
  });
  useEffect(() => {
    const engine = new DragEngine(() => optionsRef.current, setDrag);
    engineRef.current = engine;
    return () => {
      engine.destroy();
      engineRef.current = null;
    };
  }, []);
  useLayoutEffect(() => {
    engineRef.current?.afterRender();
  });
  const startDrag = useCallback((e: ReactPointerEvent<HTMLElement>, src: DragSource) => {
    engineRef.current?.start(e.nativeEvent, src);
  }, []);
  return { drag, startDrag };
}

/** Where the placeholder of a dragged entry goes in one list: at the target, or at home while there's none (or the
 *  target is a new sense, which is only drawn over the gap between two senses). */
export function listPlaceholder(drag: DragState | null, list: string, s: number): number | null {
  if (!drag || drag.src.type !== "item") return null;
  const here = (l: string, ss: number) => l === list && (list !== "O" || ss === s);
  const t = drag.check?.status === "ok" && drag.target && !drag.target.dock ? drag.target : null;
  if (t?.kind === "item") return here(t.list, t.s) ? t.i : null;
  return here(drag.src.loc.list, drag.src.loc.s) ? drag.src.loc.i : null;
}

/** Where a dragged sense's placeholder goes among the senses (the one it leaves, or the target gap). */
export function sensePlaceholder(drag: DragState | null): number | null {
  if (!drag || drag.src.type !== "sense") return null;
  const t = drag.check?.status === "ok" && drag.target && !drag.target.dock ? drag.target : null;
  return t?.kind === "senseGap" ? t.j : drag.src.s;
}

/** The gap where a dropped meaning would become a new sense. Drawn over the gap rather than making room: room
 *  there would push the senses below away from the pointer, onto a different target. */
export function newSensePlaceholder(drag: DragState | null): number | null {
  const t = drag?.check?.status === "ok" && drag.target && !drag.target.dock ? drag.target : null;
  return t?.kind === "newSense" ? t.s : null;
}

/** The box outlined under the pointer: "S", "P", "O:<sense>", "R", "POS"; red when it can't go there. */
export function highlightOf(drag: DragState | null): { key: string; bad: boolean } | null {
  const t = drag?.target;
  if (!drag || !t || !drag.check || t.dock) return null;
  const bad = drag.check.status === "blocked";
  if (t.kind === "S") return { key: "S", bad };
  if (t.kind === "toP") return { key: "P", bad };
  if (t.kind === "item") return { key: t.list === "O" ? `O:${t.s}` : t.list, bad };
  return null;
}
