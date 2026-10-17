/**
 * The lists of the word editor (useWordEditor) that can be rearranged by dragging: the meanings (S, P and the
 * secondary senses, between which a meaning can move), the other readings and the parts of speech (each only
 * reordered within itself). Every entry carries an id, so it keeps its identity while it moves.
 *
 * The rules are the ones chosen for the popup (design artifact of 2026-10-16): a dropped meaning that is already in
 * the list it lands in merges with it; P always keeps at least one meaning; S only takes a meaning while it's empty;
 * a sense emptied by a drag disappears; a whole sense dropped on P adds its meanings to the end of P.
 */

/** One entry of a list. */
export interface Item {
  id: string;
  text: string;
  /** Where it was when the popup loaded the word, in the format of placesOf ("P:0", "<sense id>:1", "S"); "" for
   *  an entry added since. */
  home: string;
}

/** One secondary sense. */
export interface Sense {
  id: string;
  /** Its position when the popup loaded the word; -1 for a sense added since. */
  home: number;
  items: Item[];
}

/** The draggable part of the popup's form. */
export interface DragLists {
  short_meaning: Item;
  primary_meanings: Item[];
  other_meanings: Sense[];
  other_readings: Item[];
  parts_of_speech: Item[];
  /** Ids of the entries and senses moved by dragging since the word was loaded. */
  moved: string[];
}

/** S = the short meaning, P = the primary meanings, O = a secondary sense, R = other readings, POS = parts of speech. */
export type ListKey = "S" | "P" | "O" | "R" | "POS";

/** An entry's place: its list, the sense (O only, 0 otherwise) and its index. */
export interface ItemLoc {
  list: ListKey;
  s: number;
  i: number;
}

export type DragSource = { type: "item"; id: string; loc: ItemLoc } | { type: "sense"; id: string; s: number };

/** Where a drag would land. `dock` names the shortcut button it came from, if any. */
export type DropTarget = (
  | { kind: "S" }
  | { kind: "item"; list: Exclude<ListKey, "S">; s: number; i: number }
  | { kind: "newSense"; s: number }
  | { kind: "senseGap"; j: number }
  | { kind: "toP" }
) & { dock?: string };

/** "none": not a place this can go, or where it already is. */
export type MoveCheck = { status: "none" } | { status: "blocked"; reason: string } | { status: "ok"; note: string };

let lastId = 0;

/** An id for an entry or a sense, unique within the page load (all it needs). */
export function newId(): string {
  lastId += 1;
  return `dnd${lastId}`;
}

export function toItems(list: string[], key: "P" | "R" | "POS"): Item[] {
  return list.map((text, i) => ({ id: newId(), text, home: `${key}:${i}` }));
}

export function toSenses(senses: string[][]): Sense[] {
  return senses.map((texts, s) => {
    const id = newId();
    return { id, home: s, items: texts.map((text, i) => ({ id: newId(), text, home: `${id}:${i}` })) };
  });
}

export function blankItem(text = ""): Item {
  return { id: newId(), text, home: "" };
}

export const textsOf = (items: Item[]) => items.map((item) => item.text);

const norm = (text: string) => text.trim().toLowerCase();

function itemsAt(d: DragLists, list: ListKey, s: number): Item[] {
  switch (list) {
    case "S":
      return [d.short_meaning];
    case "P":
      return d.primary_meanings;
    case "O":
      return d.other_meanings[s]?.items ?? [];
    case "R":
      return d.other_readings;
    case "POS":
      return d.parts_of_speech;
  }
}

const isMeaning = (list: ListKey) => list === "S" || list === "P" || list === "O";

/** Where every entry is now, in the format of Item.home. */
export function placesOf(d: DragLists): Map<string, string> {
  const places = new Map<string, string>();
  places.set(d.short_meaning.id, "S");
  d.primary_meanings.forEach((item, i) => places.set(item.id, `P:${i}`));
  d.other_meanings.forEach((sense) => sense.items.forEach((item, i) => places.set(item.id, `${sense.id}:${i}`)));
  d.other_readings.forEach((item, i) => places.set(item.id, `R:${i}`));
  d.parts_of_speech.forEach((item, i) => places.set(item.id, `POS:${i}`));
  return places;
}

/** The entry was dragged since the word was loaded and isn't where it was (moving it back clears this). */
export function itemMoved(d: DragLists, places: Map<string, string>, item: Item): boolean {
  return d.moved.includes(item.id) && places.get(item.id) !== item.home;
}

export function senseMoved(d: DragLists, sense: Sense, index: number): boolean {
  return d.moved.includes(sense.id) && sense.home !== index;
}

/** Lower-cased meaning -> the places it is in (S, P, 2nd·n), for the meanings found in more than one place. */
export function meaningPlaces(d: DragLists): Map<string, string[]> {
  const all = new Map<string, Set<string>>();
  const add = (text: string, place: string) => {
    const key = norm(text);
    if (!key) return;
    if (!all.has(key)) all.set(key, new Set());
    all.get(key)!.add(place);
  };
  add(d.short_meaning.text, "S");
  d.primary_meanings.forEach((item) => add(item.text, "P"));
  d.other_meanings.forEach((sense, s) => sense.items.forEach((item) => add(item.text, `2nd·${s + 1}`)));
  return new Map([...all].filter(([, places]) => places.size > 1).map(([key, places]) => [key, [...places]]));
}

/** The meaning already in the list a meaning would land in, when it comes from another list. */
function duplicateIn(d: DragLists, t: DropTarget, item: Item, from: ItemLoc): Item | null {
  if (t.kind !== "item" || (t.list !== "P" && t.list !== "O")) return null;
  if (t.list === from.list && t.s === from.s) return null;
  const key = norm(item.text);
  if (!key) return null;
  return itemsAt(d, t.list, t.s).find((other) => norm(other.text) === key) ?? null;
}

const NONE: MoveCheck = { status: "none" };
const ok = (note = ""): MoveCheck => ({ status: "ok", note });
const blocked = (reason: string): MoveCheck => ({ status: "blocked", reason });

/** Whether `src` can land on `t`, and what that would do. */
export function checkMove(d: DragLists, src: DragSource, t: DropTarget): MoveCheck {
  if (src.type === "sense") {
    const sense = d.other_meanings[src.s];
    if (!sense) return NONE;
    if (t.kind === "senseGap") return t.j === src.s || t.j === src.s + 1 ? NONE : ok();
    if (t.kind !== "toP") return NONE;
    const meanings = sense.items.filter((item) => item.text.trim());
    if (meanings.length === 0) return blocked("This sense has no meanings");
    const already = meanings.filter((item) => d.primary_meanings.some((p) => norm(p.text) === norm(item.text))).length;
    return ok(already ? `Adds to the end of P (${already} already there, merged)` : "Adds to the end of P");
  }

  const from = src.loc;
  const item = itemsAt(d, from.list, from.s)[from.i];
  if (!item) return NONE;
  // Other readings and parts of speech are only reordered within themselves.
  if (!isMeaning(from.list)) {
    if (t.kind !== "item" || t.list !== from.list) return NONE;
    return t.i === from.i || t.i === from.i + 1 ? NONE : ok();
  }
  if (t.kind === "senseGap" || t.kind === "toP" || (t.kind === "item" && !isMeaning(t.list))) return NONE;
  if (t.kind === "S" && from.list === "S") return NONE;
  if (t.kind === "item" && t.list === from.list && t.s === from.s && (t.i === from.i || t.i === from.i + 1)) return NONE;
  if (
    t.kind === "newSense" &&
    from.list === "O" &&
    d.other_meanings[from.s].items.length === 1 &&
    (t.s === from.s || t.s === from.s + 1)
  ) {
    return NONE;
  }

  if (t.kind === "S" && d.short_meaning.text.trim()) return blocked(`S already has “${d.short_meaning.text.trim()}”`);
  const leavesP = from.list === "P" && !(t.kind === "item" && t.list === "P");
  if (leavesP && !d.primary_meanings.some((other) => other !== item && other.text.trim())) {
    return blocked("P needs at least one meaning");
  }
  const dup = duplicateIn(d, t, item, from);
  if (dup) return ok("Already there: merges with it");
  return ok(t.kind === "newSense" ? "New sense" : "");
}

function placeName(d: DragLists, id: string): string {
  if (d.short_meaning.id === id) return "S";
  const lists: [string, Item[]][] = [
    ["P", d.primary_meanings],
    ...d.other_meanings.map((sense, s): [string, Item[]] => [`2nd·${s + 1}`, sense.items]),
    ["other readings", d.other_readings],
    ["parts of speech", d.parts_of_speech],
  ];
  for (const [name, items] of lists) {
    const i = items.findIndex((item) => item.id === id);
    if (i >= 0) return `${name}, position ${i + 1}`;
  }
  return "";
}

export interface MoveResult {
  lists: DragLists;
  /** An existing entry that the dropped one merged into, to flash. */
  flashId: string | null;
  /** What happened, for screen readers. */
  message: string;
}

/** Moves `src` onto `t` (which checkMove has allowed) and returns the new lists. */
export function applyMove(d: DragLists, src: DragSource, t: DropTarget): MoveResult {
  let short = d.short_meaning;
  let primary = [...d.primary_meanings];
  let senses = d.other_meanings.map((sense) => ({ ...sense, items: [...sense.items] }));
  let readings = [...d.other_readings];
  let pos = [...d.parts_of_speech];
  const moved = new Set(d.moved);
  const listOf = (list: ListKey, s: number): Item[] =>
    list === "P" ? primary : list === "O" ? senses[s].items : list === "R" ? readings : pos;
  const result = (message: string, flashId: string | null = null): MoveResult => ({
    lists: { short_meaning: short, primary_meanings: primary, other_meanings: senses, other_readings: readings, parts_of_speech: pos, moved: [...moved] },
    flashId,
    message,
  });

  if (src.type === "sense") {
    const sense = senses[src.s];
    if (t.kind === "senseGap") {
      senses.splice(t.j, 0, sense);
      senses.splice(t.j <= src.s ? src.s + 1 : src.s, 1);
      moved.add(sense.id);
      return result(`Moved sense ${src.s + 1} to position ${senses.indexOf(sense) + 1}`);
    }
    const added = sense.items.filter(
      (item) => item.text.trim() && !primary.some((p) => norm(p.text) === norm(item.text))
    );
    primary = [...primary, ...added];
    added.forEach((item) => moved.add(item.id));
    senses = senses.filter((other) => other !== sense);
    return result(`Added sense ${src.s + 1} to the end of P`);
  }

  const from = src.loc;
  const item = from.list === "S" ? short : listOf(from.list, from.s)[from.i];
  const dup = duplicateIn(d, t, item, from);
  const fromSense = from.list === "O" ? senses[from.s] : null;
  // A marker keeps the entry's old slot until it is inserted, so the target index stays the one the user saw.
  const MARK: Item = { id: "", text: "", home: "" };
  if (from.list === "S") short = blankItem();
  else listOf(from.list, from.s)[from.i] = MARK;

  if (t.kind === "S") short = item;
  else if (t.kind === "item" && !dup) listOf(t.list, t.s).splice(t.i, 0, item);
  else if (t.kind === "newSense") senses.splice(t.s, 0, { id: newId(), home: -1, items: [item] });

  primary = primary.filter((other) => other !== MARK);
  readings = readings.filter((other) => other !== MARK);
  pos = pos.filter((other) => other !== MARK);
  senses.forEach((sense) => {
    sense.items = sense.items.filter((other) => other !== MARK);
  });
  if (fromSense && fromSense.items.length === 0) senses = senses.filter((sense) => sense !== fromSense);

  const text = item.text.trim();
  if (dup && t.kind === "item") return result(`“${text}” was already in ${t.list === "P" ? "P" : `2nd·${t.s + 1}`}: merged`, dup.id);
  moved.add(item.id);
  const done = result("");
  return { ...done, message: `Moved “${text}” to ${placeName(done.lists, item.id)}` };
}
