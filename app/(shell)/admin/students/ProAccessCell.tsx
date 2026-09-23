"use client";

import { useEffect, useId, useRef, useState } from "react";
import { FaChevronDown } from "react-icons/fa6";
import { Toggle } from "@/app/components/ui/Toggle";
import { useStudyStats } from "@/lib/study/StudyStatsContext";
import type { StudentRosterRow } from "@/lib/types";
import { endsWithin, formatTimeLeft, proState, trialEndedAt } from "./rosterView";

const dateFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

// Kept in step with the panel's w-68 below -- its left edge is clamped to the viewport before it
// is shown, while it still has no size to measure.
const PANEL_WIDTH = 272;
const GAP = 6;
const EDGE_PADDING = 8;
// Opens upward when there's less room than this below the trigger (and more above).
const PREFERRED_HEIGHT = 300;

const PRESETS: { label: string; until: (now: Date) => Date }[] = [
  { label: "7 days", until: (now) => new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) },
  { label: "30 days", until: (now) => new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) },
  { label: "3 months", until: (now) => new Date(new Date(now).setMonth(now.getMonth() + 3)) },
  { label: "1 year", until: (now) => new Date(new Date(now).setFullYear(now.getFullYear() + 1)) },
];

const PRESET_CLASS =
  "cursor-pointer rounded-lg border border-border-soft bg-white/[0.03] px-3 py-2 text-[0.8rem] font-bold text-text-muted transition-colors hover:border-accent-gold/40 hover:text-accent-gold disabled:cursor-not-allowed disabled:opacity-40";

function toDateInputValue(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** The Pro column: the on/off toggle plus, while Pro, a chip showing how long is left that opens
 *  the end-date picker. Turning Pro on from the toggle means no end date -- the chip then sets one. */
export function ProAccessCell({
  student,
  now,
  pending,
  editable,
  onChange,
}: {
  student: StudentRosterRow;
  now: number;
  pending: boolean;
  /** False when the Pro RPC doesn't exist (NEXT_PUBLIC_MULTI_REGION off). */
  editable: boolean;
  /** `pickedAt`: the device-clock time a preset end date was counted from, so the page can refresh its `now`. */
  onChange: (isPremium: boolean, premiumUntil: string | null, pickedAt?: number) => void;
}) {
  const state = proState(student, now);
  const name = student.display_name || student.email;

  if (state === "stripe") {
    return (
      <div className="flex items-center gap-2.5">
        <Toggle checked disabled onChange={() => {}} color="gold" aria-label={`${name}'s Pro comes from Stripe`} />
        <span className="text-xs font-bold text-text-muted" title="Pro from a Stripe subscription -- managed by Stripe">
          Stripe
        </span>
      </div>
    );
  }

  const isPro = state !== "free";
  const endedAt = trialEndedAt(student, now);

  return (
    <div className="flex items-center gap-2.5">
      <Toggle
        checked={isPro}
        disabled={!editable || pending}
        onChange={() => onChange(!isPro, null)}
        color="gold"
        aria-label={isPro ? `Turn off Pro for ${name}` : `Turn on Pro for ${name}`}
      />
      {isPro && editable ? (
        <ProUntilPicker student={student} now={now} disabled={pending} onPick={(until, pickedAt) => onChange(true, until, pickedAt)} />
      ) : endedAt ? (
        <span className="whitespace-nowrap text-xs text-text-muted" title={`Pro ended ${dateFormatter.format(new Date(endedAt))}`}>
          Ended {dateFormatter.format(new Date(endedAt))}
        </span>
      ) : null}
    </div>
  );
}

function ProUntilPicker({
  student,
  now,
  disabled,
  onPick,
}: {
  student: StudentRosterRow;
  now: number;
  disabled: boolean;
  onPick: (until: string | null, pickedAt?: number) => void;
}) {
  const panelId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [custom, setCustom] = useState("");
  // Presets count from server time, not the admin's device clock -- a clock an hour behind would
  // otherwise make "7 days" an hour short. (`now` can't be used: it's up to a minute old.)
  const { clockOffsetMs } = useStudyStats();

  const until = student.premium_until;
  const expiringSoon = until !== null && endsWithin(until, now, 3);

  // A native popover lives in the top layer, so the table's overflow-x-auto card can't clip it --
  // but it only knows how to center itself, so it's placed next to its trigger just before opening
  // (no size to measure yet: width is fixed, and opening upward is anchored by `bottom`). It's
  // light-dismissed by the browser; scrolling closes it too, rather than leaving it floating while
  // its row moves away.
  useEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    function place(e: Event) {
      const trigger = triggerRef.current;
      if (!trigger || !panel || (e as ToggleEvent).newState !== "open") return;
      const rect = trigger.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom;
      const openUp = spaceBelow < PREFERRED_HEIGHT && rect.top > spaceBelow;
      panel.style.left = `${Math.max(EDGE_PADDING, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - EDGE_PADDING))}px`;
      panel.style.top = openUp ? "auto" : `${rect.bottom + GAP}px`;
      panel.style.bottom = openUp ? `${window.innerHeight - rect.top + GAP}px` : "auto";
    }

    function close() {
      panel?.hidePopover();
    }

    function onToggle(e: Event) {
      if ((e as ToggleEvent).newState === "open") {
        window.addEventListener("scroll", close, { capture: true, passive: true });
        window.addEventListener("resize", close);
      } else {
        window.removeEventListener("scroll", close, { capture: true });
        window.removeEventListener("resize", close);
        setCustom("");
      }
    }

    panel.addEventListener("beforetoggle", place);
    panel.addEventListener("toggle", onToggle);
    return () => {
      panel.removeEventListener("beforetoggle", place);
      panel.removeEventListener("toggle", onToggle);
      window.removeEventListener("scroll", close, { capture: true });
      window.removeEventListener("resize", close);
    };
  }, []);

  function pick(value: string | null, pickedAt?: number) {
    panelRef.current?.hidePopover();
    onPick(value, pickedAt);
  }

  function pickCustom() {
    const [y, m, d] = custom.split("-").map(Number);
    // The end of the chosen day, in the admin's own timezone.
    pick(new Date(y, m - 1, d, 23, 59, 59).toISOString());
  }

  // Any day from today on -- the end of today is still in the future.
  const minDate = toDateInputValue(new Date(now));

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        popoverTarget={panelId}
        disabled={disabled}
        className={`inline-flex cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border px-2.5 py-1 text-xs font-extrabold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          expiringSoon
            ? "border-accent-red/35 bg-accent-red/10 text-[#ff8a93] hover:border-accent-red/60"
            : "border-accent-gold/30 bg-accent-gold/10 text-accent-gold hover:border-accent-gold/60"
        }`}
        title={until ? `Pro until ${dateFormatter.format(new Date(until))}` : "Pro with no end date"}
      >
        {until ? formatTimeLeft(until, now) : <span className="text-sm leading-none">∞</span>}
        <FaChevronDown className="h-2.5 w-2.5 opacity-70" />
      </button>

      <div
        ref={panelRef}
        id={panelId}
        popover="auto"
        className="fixed m-0 w-68 rounded-xl border border-white/10 bg-gray-900/95 p-4 text-left text-sm text-white shadow-[0_20px_40px_rgba(0,0,0,0.5)] backdrop-blur-md"
      >
        <p className="text-[0.7rem] font-extrabold uppercase tracking-[1px] text-text-muted">Pro until</p>
        <p className="mt-1 mb-3.5 text-[0.85rem] font-semibold">
          {until ? `${dateFormatter.format(new Date(until))} · ${formatTimeLeft(until, now)}` : "No end date"}
        </p>

        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              className={PRESET_CLASS}
              onClick={() => {
                const pickedAt = Date.now();
                pick(preset.until(new Date(pickedAt + clockOffsetMs)).toISOString(), pickedAt);
              }}
            >
              {preset.label}
            </button>
          ))}
          <button type="button" className={`${PRESET_CLASS} col-span-2`} disabled={until === null} onClick={() => pick(null)}>
            ∞ No end date
          </button>
        </div>

        <label className="mt-4 mb-1.5 block text-[0.7rem] font-extrabold uppercase tracking-[1px] text-text-muted" htmlFor={`${panelId}-date`}>
          Custom date
        </label>
        <div className="flex gap-2">
          <input
            id={`${panelId}-date`}
            type="date"
            min={minDate}
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            className="min-w-0 flex-1 rounded-lg border border-border-soft bg-white/[0.03] px-2.5 py-1.5 text-[0.85rem] text-white outline-none [color-scheme:dark] focus:border-accent-gold/50"
          />
          <button
            type="button"
            className="cursor-pointer rounded-lg bg-accent-gold px-3 py-1.5 text-[0.8rem] font-extrabold text-black disabled:cursor-not-allowed disabled:opacity-40"
            disabled={!custom || custom < minDate}
            onClick={pickCustom}
          >
            Set
          </button>
        </div>
      </div>
    </>
  );
}
